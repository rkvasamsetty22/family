"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, signIn } from "@/auth";
import { isAllowed } from "@/auth.config";
import { hashPassword, MIN_PASSWORD, safeEqual } from "@/lib/password";
import { str } from "@/lib/form";

const back = (q: string): never => redirect(`/login?${q}`);

export async function loginWithPassword(fd: FormData) {
  try {
    await signIn("password", { email: str(fd, "email"), password: fd.get("password"), redirectTo: "/" });
  } catch (e) {
    if (e instanceof AuthError) back("error=password");
    throw e;
  }
}

export async function emailSignInLink(fd: FormData) {
  const email = str(fd, "email")?.toLowerCase();
  // Same response for unknown emails, so the page does not reveal who is on the list.
  if (!email || !isAllowed(email)) back("sent=1");
  try {
    await signIn("resend", { email, redirectTo: "/" });
  } catch (e) {
    if (e instanceof AuthError) back("error=link");
    throw e;
  }
}

async function savePassword(email: string, password: string) {
  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, existing.id));
  else await db.insert(schema.users).values({ email, passwordHash });
}

// First-time setup or recovery without email: needs the SETUP_CODE from Vercel settings.
export async function setupPassword(fd: FormData) {
  const code = process.env.SETUP_CODE?.trim();
  const email = str(fd, "email")?.toLowerCase() ?? "";
  const password = String(fd.get("password") ?? "");
  if (!code) back("setup=disabled");
  if (!safeEqual(String(fd.get("code") ?? "").trim(), code!) || !isAllowed(email)) {
    await new Promise((r) => setTimeout(r, 800));
    back("setup=invalid");
  }
  if (password.length < MIN_PASSWORD) back("setup=short");
  if (password !== fd.get("confirm")) back("setup=mismatch");
  await savePassword(email, password);
  await loginWithPassword(fd);
}

export async function changePassword(fd: FormData) {
  const user = await requireUser();
  const password = String(fd.get("password") ?? "");
  if (password.length < MIN_PASSWORD) redirect("/settings?pw=short");
  if (password !== fd.get("confirm")) redirect("/settings?pw=mismatch");
  await savePassword(user.email!.toLowerCase(), password);
  redirect("/settings?pw=saved");
}
