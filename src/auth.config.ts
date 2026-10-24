import type { NextAuthConfig } from "next-auth";

export const allowedEmails = () =>
  (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const isAllowed = (email: string | null | undefined) =>
  !!email && allowedEmails().includes(email.trim().toLowerCase());

// Edge-safe part of the config, shared by middleware. Providers that need the
// database or Node crypto are added in auth.ts.
export const authConfig = {
  providers: [],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", verifyRequest: "/login?sent=1", error: "/login" },
  callbacks: {
    authorized({ auth }) {
      return isAllowed(auth?.user?.email);
    },
  },
} satisfies NextAuthConfig;
