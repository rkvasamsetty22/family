import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import type { Provider } from "next-auth/providers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authConfig } from "./auth.config";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/password";
import { lookupActiveUser, touchLogin, userForSession } from "@/lib/users";
import { anyLocked, clearFailures, LOGIN_EMAIL, LOGIN_IP, pruneThrottle, recordFailure } from "@/lib/throttle";
import { audit, clientIp } from "@/lib/audit";

// Shown as "too many attempts"; deliberately says nothing about whether the email exists.
export class LockedSignin extends CredentialsSignin {
  code = "locked";
}

export const googleEnabled = () => !!process.env.AUTH_GOOGLE_ID?.trim();
export const devLoginEnabled = () => process.env.NODE_ENV !== "production" && !!process.env.DEV_LOGIN_EMAIL;

const providers: Provider[] = [
  Credentials({
    id: "password",
    name: "Email and password",
    credentials: { email: {}, password: {} },
    async authorize(creds, request) {
      const email = String(creds?.email ?? "").trim().toLowerCase().slice(0, 320);
      const password = String(creds?.password ?? "");
      const ip = clientIp(request.headers);
      const keys = [`login:email:${email}`, `login:ip:${ip}`];
      if (await anyLocked(keys)) {
        await audit("login_locked", email, null, request.headers);
        throw new LockedSignin();
      }
      const [user] = email ? await db.select().from(schema.users).where(eq(schema.users.email, email)) : [];
      // Always run the hash check so an unknown email takes as long as a wrong password.
      const ok = await verifyPassword(password, user?.passwordHash);
      if (!ok || !user || !user.active) {
        const locked = await recordFailure([
          [keys[0], LOGIN_EMAIL],
          [keys[1], LOGIN_IP],
        ]);
        await audit(locked ? "login_locked" : "login_failed", email, null, request.headers);
        if (locked) throw new LockedSignin();
        return null;
      }
      await clearFailures([keys[0]]);
      if (needsRehash(user.passwordHash)) {
        await db.update(schema.users).set({ passwordHash: await hashPassword(password) }).where(eq(schema.users.id, user.id));
      }
      await touchLogin(email);
      await audit("login", email, null, request.headers);
      if (Math.random() < 0.05) await pruneThrottle();
      return { id: user.id, email, name: user.name };
    },
  }),
];

if (googleEnabled()) {
  // Trim in case the values were pasted into Vercel with stray spaces or newlines.
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID?.trim(),
      clientSecret: process.env.AUTH_GOOGLE_SECRET?.trim(),
    }),
  );
}

// Local development only: sign in as DEV_LOGIN_EMAIL without a password.
if (devLoginEnabled()) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: {},
      authorize: () => ({ id: "dev", email: process.env.DEV_LOGIN_EMAIL!, name: "Dev" }),
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      return !!(await lookupActiveUser(user.email));
    },
  },
});

// Pages, server actions and route handlers call this, so a removed or deactivated
// user loses access immediately even if their session token has not expired.
export async function currentUser() {
  return userForSession(await auth());
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("Not authorised");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) throw new Error("Only admins can do this");
  return user;
}
