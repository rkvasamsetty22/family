import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import type { Provider } from "next-auth/providers";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authConfig, isAllowed } from "./auth.config";
import { verifyPassword } from "@/lib/password";

export const emailLinkEnabled = () => !!process.env.RESEND_API_KEY;
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
      if (!isAllowed(email) || !password) return null;
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        // Slow down guessing
        await new Promise((r) => setTimeout(r, 800));
        return null;
      }
      return { id: user.id, email: user.email, name: user.name };
    },
  }),
];

if (emailLinkEnabled()) {
  providers.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM || process.env.REMINDER_FROM || "Family Finance <onboarding@resend.dev>",
      maxAge: 15 * 60,
    }),
  );
}

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
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.authAccounts,
    sessionsTable: schema.authSessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    // Runs for every provider, including before a sign-in link is emailed.
    signIn({ user }) {
      return isAllowed(user.email);
    },
  },
});

// Server actions and route handlers call this so data is never reachable without a session.
export async function requireUser() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!isAllowed(email)) throw new Error("Not authorised");
  return session!.user!;
}
