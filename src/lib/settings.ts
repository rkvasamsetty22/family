import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const SETTING_DEFAULTS = {
  pettyThreshold: "500",
  reminderDays: "7",
  members: "Self,Spouse",
};
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await db.select().from(schema.settings);
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) if (r.key in out) out[r.key as SettingKey] = r.value;
  return out;
}

export async function setSetting(key: SettingKey, value: string) {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

export async function getSetting(key: SettingKey) {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  return row?.value ?? SETTING_DEFAULTS[key];
}
