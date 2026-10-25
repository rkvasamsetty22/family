import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import { userForSession } from "@/lib/users";
import { contentSecurityPolicy } from "@/lib/csp";

const { auth } = NextAuth(authConfig);

// Reachable without signing in. Cron checks its own secret.
const PUBLIC = /^\/(login|api\/auth|api\/cron)(\/|$)/;

// Runs on Node.js so every request, including in-app navigation, is checked against the
// database: a removed user, an old session or one from before a password change is turned away.
export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  if (!PUBLIC.test(pathname) && !(await userForSession(req.auth))) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);
  return res;
});

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
