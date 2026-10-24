import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

// Reuse one connection pool across hot reloads and warm serverless invocations.
const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, { max: 5, prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql, { schema });
export { schema };
