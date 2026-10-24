export { auth as middleware } from "@/auth";

// Everything except the login page, auth endpoints, cron (checks its own secret) and static files.
export const config = {
  matcher: ["/((?!login|api/auth|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
