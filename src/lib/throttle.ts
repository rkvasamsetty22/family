import { eq, inArray, lt, and, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";

export type Limit = { max: number; windowMs: number; lockMs: number };

const MIN = 60_000;
// 5 wrong passwords for one email, or 20 from one IP, within 15 minutes locks for 15 minutes.
export const LOGIN_EMAIL: Limit = { max: 5, windowMs: 15 * MIN, lockMs: 15 * MIN };
export const LOGIN_IP: Limit = { max: 20, windowMs: 15 * MIN, lockMs: 15 * MIN };
// The setup code can reset an admin password, so it gets far fewer tries.
export const SETUP_IP: Limit = { max: 5, windowMs: 60 * MIN, lockMs: 60 * MIN };
export const SETUP_ALL: Limit = { max: 20, windowMs: 60 * MIN, lockMs: 60 * MIN };

type Row = typeof schema.authThrottle.$inferSelect;

// Pure so it can be tested: the row after one more failure.
export function nextState(row: Pick<Row, "failures" | "windowStart" | "lockedUntil"> | undefined, limit: Limit, now: Date) {
  const fresh = !row || now.getTime() - row.windowStart.getTime() > limit.windowMs;
  const failures = fresh ? 1 : row.failures + 1;
  const windowStart = fresh ? now : row.windowStart;
  const lockedUntil = failures >= limit.max ? new Date(now.getTime() + limit.lockMs) : fresh ? null : row.lockedUntil;
  return { failures, windowStart, lockedUntil };
}

export const isLocked = (row: Pick<Row, "lockedUntil"> | undefined, now = new Date()) =>
  !!row?.lockedUntil && row.lockedUntil.getTime() > now.getTime();

export async function anyLocked(keys: string[]) {
  const rows = await db.select().from(schema.authThrottle).where(inArray(schema.authThrottle.key, keys));
  return rows.some((r) => isLocked(r));
}

// Records a failure against each key; returns true if any of them is now locked.
export async function recordFailure(entries: [string, Limit][]) {
  const now = new Date();
  let locked = false;
  for (const [key, limit] of entries) {
    const [row] = await db.select().from(schema.authThrottle).where(eq(schema.authThrottle.key, key));
    const next = nextState(row, limit, now);
    locked ||= isLocked(next, now);
    await db
      .insert(schema.authThrottle)
      .values({ key, ...next })
      .onConflictDoUpdate({ target: schema.authThrottle.key, set: next });
  }
  return locked;
}

export async function clearFailures(keys: string[]) {
  await db.delete(schema.authThrottle).where(inArray(schema.authThrottle.key, keys));
}

// Old rows are only clutter; drop them now and then.
export async function pruneThrottle() {
  const cutoff = new Date(Date.now() - 24 * 60 * MIN);
  await db
    .delete(schema.authThrottle)
    .where(and(lt(schema.authThrottle.windowStart, cutoff), or(isNull(schema.authThrottle.lockedUntil), lt(schema.authThrottle.lockedUntil, cutoff))));
}
