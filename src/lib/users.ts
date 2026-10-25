import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { isAdminEmail, sessionTooOld } from "@/auth.config";

export type AppUser = { email: string; name: string | null; isAdmin: boolean; passwordChangedAt: Date | null };

// The single place that decides whether an email may use the app.
export async function lookupActiveUser(email: string | null | undefined): Promise<AppUser | null> {
  const e = email?.trim().toLowerCase();
  if (!e) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, e));
  if (u)
    return u.active
      ? { email: e, name: u.name, isAdmin: u.role === "admin" || isAdminEmail(e), passwordChangedAt: u.passwordChangedAt }
      : null;
  return isAdminEmail(e) ? { email: e, name: null, isAdmin: true, passwordChangedAt: null } : null;
}

// The user behind a session, or null if the session is too old, the user was removed or
// deactivated, or their password changed after this session signed in.
export async function userForSession(session: { user?: { email?: string | null }; authTime?: number } | null) {
  if (!session || sessionTooOld(session.authTime)) return null;
  const user = await lookupActiveUser(session.user?.email);
  if (!user) return null;
  if (user.passwordChangedAt && session.authTime! < user.passwordChangedAt.getTime()) return null;
  return user;
}

export async function touchLogin(email: string) {
  await db.update(schema.users).set({ lastLoginAt: sql`now()` }).where(eq(schema.users.email, email.toLowerCase()));
}
