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

// Edge-safe part of the config, shared by middleware. A session token is only issued
// after auth.ts has checked the user; pages and actions re-check them in the database.
export const authConfig = {
  providers: [],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user?.email;
    },
  },
} satisfies NextAuthConfig;
