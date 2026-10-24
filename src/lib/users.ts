import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { isAdminEmail } from "@/auth.config";

export type AppUser = { email: string; name: string | null; isAdmin: boolean };

// The single place that decides whether an email may use the app.
export async function lookupActiveUser(email: string | null | undefined): Promise<AppUser | null> {
  const e = email?.trim().toLowerCase();
  if (!e) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, e));
  if (u) return u.active ? { email: e, name: u.name, isAdmin: u.role === "admin" || isAdminEmail(e) } : null;
  return isAdminEmail(e) ? { email: e, name: null, isAdmin: true } : null;
}

export async function touchLogin(email: string) {
  await db.update(schema.users).set({ lastLoginAt: sql`now()` }).where(eq(schema.users.email, email.toLowerCase()));
}
