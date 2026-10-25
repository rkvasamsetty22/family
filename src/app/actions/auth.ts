"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin, requireUser, signIn, signOut } from "@/auth";
import { isAdminEmail } from "@/auth.config";
import { hashPassword, passwordProblem, safeEqual } from "@/lib/password";
import { str } from "@/lib/form";
import { anyLocked, clearFailures, recordFailure, SETUP_ALL, SETUP_IP } from "@/lib/throttle";
import { audit, clientIp } from "@/lib/audit";

const back = (q: string): never => redirect(`/login?${q}`);

export async function loginWithPassword(fd: FormData) {
  try {
    await signIn("password", { email: str(fd, "email"), password: fd.get("password"), redirectTo: "/" });
  } catch (e) {
    if (e instanceof CredentialsSignin && e.code === "locked") back("error=locked");
    if (e instanceof AuthError) back("error=password");
    throw e;
  }
}

async function savePassword(email: string, password: string, extra: Partial<typeof schema.users.$inferInsert> = {}) {
  const passwordHash = await hashPassword(password);
  extra = { passwordChangedAt: new Date(), ...extra };
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
  const keys = [`setup:ip:${clientIp(await headers())}`, "setup:all"];
  if (await anyLocked(keys)) back("setup=locked");
  if (!safeEqual(String(fd.get("code") ?? "").trim(), code!) || !isAdminEmail(email)) {
    const locked = await recordFailure([
      [keys[0], SETUP_IP],
      [keys[1], SETUP_ALL],
    ]);
    await audit("setup_failed", email);
    back(locked ? "setup=locked" : "setup=invalid");
  }
  const problem = passwordProblem(password, email);
  if (problem) back(`setup=${problem}`);
  if (password !== fd.get("confirm")) back("setup=mismatch");
  await clearFailures([keys[0]]);
  await savePassword(email, password, { role: "admin", active: true });
  await audit("setup_password", email, email);
  await loginWithPassword(fd);
}

// Signs out here too: every session from before the change stops working.
export async function changePassword(fd: FormData) {
  const user = await requireUser();
  const password = String(fd.get("password") ?? "");
  const problem = passwordProblem(password, user.email);
  if (problem) redirect(`/settings?pw=${problem}`);
  if (password !== fd.get("confirm")) redirect("/settings?pw=mismatch");
  await savePassword(user.email, password);
  await audit("password_changed", user.email, user.email);
  await signOut({ redirectTo: "/login?changed=1" });
}

// Family users (admin only)

const toUsers = (q: string): never => redirect(`/users?${q}`);

export async function createUser(fd: FormData) {
  const me = await requireAdmin();
  const email = str(fd, "email")?.toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) toUsers("msg=email");
  const problem = passwordProblem(password, email);
  if (problem) toUsers(`msg=${problem}`);
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email!));
  if (existing) toUsers("msg=exists");
  await db.insert(schema.users).values({
    email: email!,
    name: str(fd, "name"),
    role: fd.get("role") === "admin" ? "admin" : "member",
    passwordHash: await hashPassword(password),
    passwordChangedAt: new Date(),
  });
  await audit("user_created", me.email, email!);
  revalidatePath("/users");
  toUsers("msg=created");
}

export async function resetUserPassword(fd: FormData) {
  const me = await requireAdmin();
  const password = String(fd.get("password") ?? "");
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, String(fd.get("id"))));
  if (!target) toUsers("msg=saved");
  const problem = passwordProblem(password, target.email);
  if (problem) toUsers(`msg=${problem}`);
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date() })
    .where(eq(schema.users.id, target.id));
  if (target.email) await clearFailures([`login:email:${target.email}`]);
  await audit("password_reset", me.email, target.email);
  toUsers("msg=reset");
}

// Admins cannot lock themselves out: their own row is excluded from these updates.
export async function updateUserAccess(fd: FormData) {
  const me = await requireAdmin();
  const id = String(fd.get("id"));
  const notMe = and(eq(schema.users.id, id), ne(schema.users.email, me.email));
  const action = String(fd.get("action"));
  const [target] = await db.select({ email: schema.users.email }).from(schema.users).where(notMe);
  if (!target) toUsers("msg=saved");
  if (action === "deactivate") await db.update(schema.users).set({ active: false }).where(notMe);
  else if (action === "activate") await db.update(schema.users).set({ active: true }).where(notMe);
  else if (action === "make_admin") await db.update(schema.users).set({ role: "admin" }).where(notMe);
  else if (action === "make_member") await db.update(schema.users).set({ role: "member" }).where(notMe);
  else if (action === "delete") await db.delete(schema.users).where(notMe);
  else toUsers("msg=saved");
  const EVENTS = {
    deactivate: "user_deactivated",
    activate: "user_activated",
    make_admin: "user_made_admin",
    make_member: "user_made_member",
    delete: "user_deleted",
  } as const;
  await audit(EVENTS[action as keyof typeof EVENTS], me.email, target.email);
  revalidatePath("/users");
  toUsers("msg=saved");
}
