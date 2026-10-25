import type { NextAuthConfig } from "next-auth";

// Emails in ALLOWED_EMAILS are the family admins. They can set their own password
// with SETUP_CODE and add everyone else under Family users.
export const adminEmails = () =>
  (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const isAdminEmail = (email: string | null | undefined) =>
  !!email && adminEmails().includes(email.trim().toLowerCase());

// A session ends after 2 hours without use, and 12 hours after sign-in regardless.
export const IDLE_SECONDS = 2 * 60 * 60;
export const ABSOLUTE_MS = 12 * 60 * 60 * 1000;

export const sessionTooOld = (authTime: number | undefined, now = Date.now()) =>
  typeof authTime !== "number" || now - authTime > ABSOLUTE_MS;

// Edge-safe part of the config, shared by middleware. A session token is only issued
// after auth.ts has checked the user; middleware, actions and route handlers re-check them in the database.
export const authConfig = {
  providers: [],
  session: { strategy: "jwt", maxAge: IDLE_SECONDS, updateAge: 5 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    jwt({ token, user }) {
      // `user` is only present on sign-in: remember when that happened.
      if (user) token.authTime = Date.now();
      return token;
    },
    session({ session, token }) {
      session.authTime = token.authTime as number | undefined;
      return session;
    },
  },
} satisfies NextAuthConfig;

declare module "next-auth" {
  interface Session {
    authTime?: number;
  }
}
