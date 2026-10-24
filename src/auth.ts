import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";

const allowed = () =>
  (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

const providers: Provider[] = [Google];

// Local development only: sign in as DEV_LOGIN_EMAIL without Google.
if (process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN_EMAIL) {
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
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    signIn({ user }) {
      const email = user.email?.toLowerCase();
      return !!email && allowed().includes(email);
    },
    authorized({ auth }) {
      const email = auth?.user?.email?.toLowerCase();
      return !!email && allowed().includes(email);
    },
  },
});

// Server actions and route handlers call this so data is never reachable without a session.
export async function requireUser() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !allowed().includes(email)) throw new Error("Not authorised");
  return session!.user!;
}
