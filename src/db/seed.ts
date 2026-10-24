import "dotenv/config";
import { db, schema } from "./index";
import { DEFAULT_HEADS } from "../lib/heads";

async function main() {
  await db.insert(schema.heads).values(DEFAULT_HEADS).onConflictDoNothing();
  const existing = await db.select().from(schema.accounts);
  if (!existing.some((a) => a.type === "cash")) {
    await db.insert(schema.accounts).values({ name: "Cash in hand", type: "cash" });
  }
  console.log("Seeded heads and cash account");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
