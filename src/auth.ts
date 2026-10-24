import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authConfig } from "./auth.config";
import { verifyPassword } from "@/lib/password";
import { lookupActiveUser, touchLogin } from "@/lib/users";

export const googleEnabled = () => !!process.env.AUTH_GOOGLE_ID?.trim();
export const devLoginEnabled = () => process.env.NODE_ENV !== "production" && !!process.env.DEV_LOGIN_EMAIL;

const providers: Provider[] = [
  Credentials({
    id: "password",
    name: "Email and password",
    credentials: { email: {}, password: {} },
    async authorize(creds) {
      const email = String(creds?.email ?? "").trim().toLowerCase();
      const password = String(creds?.password ?? "");
      const [user] = email ? await db.select().from(schema.users).where(eq(schema.users.email, email)) : [];
      if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
        // Slow down guessing
        await new Promise((r) => setTimeout(r, 800));
        return null;
      }
      await touchLogin(email);
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
export async function requireUser() {
  const session = await auth();
  const user = await lookupActiveUser(session?.user?.email);
  if (!user) throw new Error("Not authorised");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) throw new Error("Only admins can do this");
  return user;
}
