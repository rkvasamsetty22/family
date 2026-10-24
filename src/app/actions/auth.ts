"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin, requireUser, signIn } from "@/auth";
import { isAdminEmail } from "@/auth.config";
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

async function savePassword(email: string, password: string, extra: Partial<typeof schema.users.$inferInsert> = {}) {
  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) await db.update(schema.users).set({ passwordHash, ...extra }).where(eq(schema.users.id, existing.id));
  else await db.insert(schema.users).values({ email, passwordHash, ...extra });
}

// First-time setup or recovery for admins (ALLOWED_EMAILS): needs SETUP_CODE from Vercel settings.
export async function setupPassword(fd: FormData) {
  const code = process.env.SETUP_CODE?.trim();
  const email = str(fd, "email")?.toLowerCase() ?? "";
  const password = String(fd.get("password") ?? "");
  if (!code) back("setup=disabled");
  if (!safeEqual(String(fd.get("code") ?? "").trim(), code!) || !isAdminEmail(email)) {
    await new Promise((r) => setTimeout(r, 800));
    back("setup=invalid");
  }
  if (password.length < MIN_PASSWORD) back("setup=short");
  if (password !== fd.get("confirm")) back("setup=mismatch");
  await savePassword(email, password, { role: "admin", active: true });
  await loginWithPassword(fd);
}

export async function changePassword(fd: FormData) {
  const user = await requireUser();
  const password = String(fd.get("password") ?? "");
  if (password.length < MIN_PASSWORD) redirect("/settings?pw=short");
  if (password !== fd.get("confirm")) redirect("/settings?pw=mismatch");
  await savePassword(user.email, password);
  redirect("/settings?pw=saved");
}

// Family users (admin only)

const toUsers = (q: string): never => redirect(`/users?${q}`);

export async function createUser(fd: FormData) {
  await requireAdmin();
  const email = str(fd, "email")?.toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) toUsers("msg=email");
  if (password.length < MIN_PASSWORD) toUsers("msg=short");
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email!));
  if (existing) toUsers("msg=exists");
  await db.insert(schema.users).values({
    email: email!,
    name: str(fd, "name"),
    role: fd.get("role") === "admin" ? "admin" : "member",
    passwordHash: await hashPassword(password),
  });
  revalidatePath("/users");
  toUsers("msg=created");
}

export async function resetUserPassword(fd: FormData) {
  await requireAdmin();
  const password = String(fd.get("password") ?? "");
  if (password.length < MIN_PASSWORD) toUsers("msg=short");
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(schema.users.id, String(fd.get("id"))));
  toUsers("msg=reset");
}

// Admins cannot lock themselves out: their own row is excluded from these updates.
export async function updateUserAccess(fd: FormData) {
  const me = await requireAdmin();
  const id = String(fd.get("id"));
  const notMe = and(eq(schema.users.id, id), ne(schema.users.email, me.email));
  const action = fd.get("action");
  if (action === "deactivate") await db.update(schema.users).set({ active: false }).where(notMe);
  else if (action === "activate") await db.update(schema.users).set({ active: true }).where(notMe);
  else if (action === "make_admin") await db.update(schema.users).set({ role: "admin" }).where(notMe);
  else if (action === "make_member") await db.update(schema.users).set({ role: "member" }).where(notMe);
  else if (action === "delete") await db.delete(schema.users).where(notMe);
  revalidatePath("/users");
  toUsers("msg=saved");
}
