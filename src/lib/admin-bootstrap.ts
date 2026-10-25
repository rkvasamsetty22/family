import { createHmac } from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { hashPassword, passwordProblem } from "./password";

const APPLIED_KEY = "adminEnvPasswordApplied";

// Sets the admin's password from ADMIN_EMAIL and ADMIN_PASSWORD at deploy time.
// Only a new ADMIN_PASSWORD value is applied, so a password changed later in the app is not
// overwritten on every deploy. The password itself is never stored or logged, only its hash
// and a keyed fingerprint that tells whether this value was already applied.
export async function applyAdminPassword(env = process.env): Promise<string> {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD ?? "";
  if (!email || !password) return "ADMIN_EMAIL / ADMIN_PASSWORD not set: admin password unchanged";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("ADMIN_EMAIL is not a valid email");
  const problem = passwordProblem(password, email);
  if (problem) throw new Error(`ADMIN_PASSWORD is not acceptable (${problem}). Use at least 10 characters that are not easy to guess.`);

  const fingerprint = createHmac("sha256", env.AUTH_SECRET ?? "family-finance").update(`${email}\0${password}`).digest("base64");
  const [applied] = await db.select().from(schema.settings).where(eq(schema.settings.key, APPLIED_KEY));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (applied?.value === fingerprint && user?.passwordHash) return `Admin ${email}: password already applied`;

  const values = { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), role: "admin", active: true };
  if (user) await db.update(schema.users).set(values).where(eq(schema.users.id, user.id));
  else await db.insert(schema.users).values({ email, name: "Admin", ...values });
  await db
    .insert(schema.settings)
    .values({ key: APPLIED_KEY, value: fingerprint })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: fingerprint } });
  // Lockouts from before the new password no longer apply.
  await db.delete(schema.authThrottle).where(eq(schema.authThrottle.key, `login:email:${email}`));
  return `Admin ${email}: password set from ADMIN_PASSWORD`;
}
