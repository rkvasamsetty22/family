import "dotenv/config";
import { db, schema } from "./index";
import { DEFAULT_HEADS } from "../lib/heads";
import { applyAdminPassword } from "../lib/admin-bootstrap";

async function main() {
  await db.insert(schema.heads).values(DEFAULT_HEADS).onConflictDoNothing();
  const existing = await db.select().from(schema.accounts);
  if (!existing.some((a) => a.type === "cash")) {
    await db.insert(schema.accounts).values({ name: "Cash in hand", type: "cash" });
  }
  console.log("Seeded heads and cash account");
  console.log(await applyAdminPassword());
  process.exit(0);
}

main().catch((e) => {
  // Database errors carry the query parameters (which can include a password hash): print only the cause.
  const err = e as Error & { cause?: Error };
  console.error("Seed failed:", err.cause?.message ?? err.message);
  process.exit(1);
});
