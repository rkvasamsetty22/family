import { createHash } from "crypto";
import { db, schema } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { suggestHeads } from "./ai";
import { getSettings } from "./settings";
import type { ParsedTxn } from "./statements/parse";
import { applyPostingEffects } from "./posting";

const STOP = new Set(
  "upi neft imps rtgs mmt p2m p2a ecs pos ecom ach nach inb mob mb ib bil onl transfer trf payment pay paid to from by the for ref txn dr cr int ind india pvt ltd private limited bank via a/c ac acct".split(
    " ",
  ),
);

// Best guess at the merchant/person in a narration, used as the default rule pattern.
export function guessPattern(desc: string): string {
  const tokens = desc
    .split(/[\/\-*:|@,]+|\s+/)
    .map((t) => t.trim())
    .filter((t) => /^[A-Za-z][A-Za-z.&']{2,}$/.test(t) && !STOP.has(t.toLowerCase()));
  return (tokens[0] ?? desc.slice(0, 20)).toUpperCase();
}

export function txnHash(t: ParsedTxn, occurrence: number) {
  const key = [t.date, t.amount.toFixed(2), t.direction, t.description.toLowerCase().replace(/\s+/g, " "), occurrence].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

type Rule = typeof schema.rules.$inferSelect;

export function matchRule(rules: Rule[], desc: string, direction: string): Rule | undefined {
  const d = desc.toLowerCase();
  return rules
    .filter((r) => (!r.direction || r.direction === direction) && d.includes(r.pattern.toLowerCase()))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
}

const TRANSFER_RE = /\b(self|own a\/?c|sweep|autosweep|fd booking)\b/i;
const CARD_RE = /(credit ?card|cc payment|card payment|bbps.*card|cred club)/i;
const ATM_RE = /\b(atm|cash wdl|cash withdrawal|nwd|awb)\b/i;

export type ImportResult = { importId: number; added: number; skipped: number; autoPosted: number; pending: number };

export async function importTransactions(accountId: number, filename: string, parsed: ParsedTxn[]): Promise<ImportResult> {
  const [allHeads, rules, accounts, settings] = await Promise.all([
    db.select().from(schema.heads).where(eq(schema.heads.archived, false)),
    db.select().from(schema.rules),
    db.select().from(schema.accounts),
    getSettings(),
  ]);
  const byName = new Map(allHeads.map((h) => [h.name, h]));
  const petty = allHeads.find((h) => h.isPetty);
  const threshold = Number(settings.pettyThreshold) || 0;
  const otherLast4 = accounts.filter((a) => a.id !== accountId && a.last4).map((a) => a.last4!);

  // Hash with an occurrence counter so two identical same-day rows both survive, while
  // re-importing an overlapping statement skips rows already stored.
  const seen = new Map<string, number>();
  const rows = parsed.map((t) => {
    const base = txnHash(t, 0);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { t, hash: txnHash(t, n) };
  });
  const existing = rows.length
    ? await db
        .select({ hash: schema.transactions.hash })
        .from(schema.transactions)
        .where(and(eq(schema.transactions.accountId, accountId), inArray(schema.transactions.hash, rows.map((r) => r.hash))))
    : [];
  const existingSet = new Set(existing.map((e) => e.hash));
  const fresh = rows.filter((r) => !existingSet.has(r.hash));

  type Draft = typeof schema.transactions.$inferInsert;
  const drafts: Draft[] = fresh.map(({ t, hash }) => ({
    accountId,
    date: t.date,
    description: t.description,
    amount: t.amount.toFixed(2),
    direction: t.direction,
    source: "import",
    hash,
    status: "pending",
  }));

  const needAi: number[] = [];
  drafts.forEach((d, i) => {
    const rule = matchRule(rules, d.description, d.direction);
    if (rule) {
      Object.assign(d, { headId: rule.headId, loanId: rule.loanId, policyId: rule.policyId, suggestedBy: "rule", status: "posted" });
      return;
    }
    const desc = d.description;
    const toOwn = otherLast4.some((l4) => desc.includes(l4));
    if (ATM_RE.test(desc) && d.direction === "out" && byName.get("Cash withdrawal")) {
      Object.assign(d, { headId: byName.get("Cash withdrawal")!.id, suggestedBy: "transfer" });
    } else if (CARD_RE.test(desc) && byName.get("Credit card bill payment")) {
      Object.assign(d, { headId: byName.get("Credit card bill payment")!.id, suggestedBy: "transfer" });
    } else if ((toOwn || TRANSFER_RE.test(desc)) && byName.get("Own account transfer")) {
      Object.assign(d, { headId: byName.get("Own account transfer")!.id, suggestedBy: "transfer" });
    } else if (petty && d.direction === "out" && Number(d.amount) < threshold) {
      Object.assign(d, { headId: petty.id, suggestedBy: "petty", status: "posted" });
    } else {
      needAi.push(i);
    }
  });

  try {
    const ai = await suggestHeads(
      needAi.map((i) => ({ description: drafts[i].description, amount: Number(drafts[i].amount), direction: drafts[i].direction as "in" | "out" })),
      allHeads,
    );
    ai.forEach((name, k) => {
      const h = byName.get(name);
      if (h) Object.assign(drafts[needAi[k]], { headId: h.id, suggestedBy: "ai" });
    });
  } catch (e) {
    // Only the message: the error object can carry request details.
    console.error("AI head suggestion failed:", (e as Error).message);
  }

  const [imp] = await db
    .insert(schema.imports)
    .values({ accountId, filename, rowCount: drafts.length, skipped: rows.length - fresh.length })
    .returning();
  if (drafts.length) {
    const inserted = await db
      .insert(schema.transactions)
      .values(drafts.map((d) => ({ ...d, importId: imp.id })))
      .onConflictDoNothing()
      .returning();
    for (const t of inserted) if (t.status === "posted") await applyPostingEffects(t);
  }
  const autoPosted = drafts.filter((d) => d.status === "posted").length;
  return { importId: imp.id, added: drafts.length, skipped: rows.length - fresh.length, autoPosted, pending: drafts.length - autoPosted };
}
