import { headers } from "next/headers";
import { db, schema } from "@/db";

// Vercel sets x-forwarded-for itself, so its first entry is the real client address.
export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

export type AuditEvent =
  | "login"
  | "login_failed"
  | "login_locked"
  | "setup_password"
  | "setup_failed"
  | "password_changed"
  | "user_created"
  | "password_reset"
  | "user_deactivated"
  | "user_activated"
  | "user_made_admin"
  | "user_made_member"
  | "user_deleted";

// Best effort: a logging problem must never block signing in.
export async function audit(event: AuditEvent, actor: string | null, target: string | null = null, h?: Headers) {
  try {
    const ip = clientIp(h ?? (await headers()));
    await db.insert(schema.auditLog).values({ event, actor, target, ip });
  } catch (e) {
    console.error("audit log write failed:", (e as Error).message);
  }
}
