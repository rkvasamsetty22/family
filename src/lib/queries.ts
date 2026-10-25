import { db, schema } from "@/db";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { addDays, nextEmiDate, todayIST } from "./dates";
import { toNum } from "./format";

export const listHeads = () =>
  db.select().from(schema.heads).where(eq(schema.heads.archived, false)).orderBy(asc(schema.heads.kind), asc(schema.heads.name));
export const listAccounts = () =>
  db.select().from(schema.accounts).where(eq(schema.accounts.archived, false)).orderBy(asc(schema.accounts.name));
export const listOpenLoans = () =>
  db.select().from(schema.loans).where(eq(schema.loans.closed, false)).orderBy(asc(schema.loans.party));
export const listActivePolicies = () =>
  db.select().from(schema.policies).where(eq(schema.policies.active, true)).orderBy(asc(schema.policies.nextDueDate));

export type Reminder = {
  date: string;
  kind: "EMI" | "Premium" | "Payable" | "Receivable" | "Maturity";
  title: string;
  amount: number | null;
  href: string;
};

// Colour each reminder type like the head kind it belongs to.
export const REMINDER_KIND: Record<Reminder["kind"], string> = { EMI: "loan", Premium: "investment", Payable: "expense", Receivable: "income", Maturity: "transfer" };

// Everything falling due from (today - lookback) to today + days, overdue first.
export async function upcomingReminders(days: number, from: string = todayIST()): Promise<Reminder[]> {
  const until = addDays(from, days);
  const [loans, policies, dues] = await Promise.all([
    db.select().from(schema.loans).where(eq(schema.loans.closed, false)),
    db.select().from(schema.policies).where(eq(schema.policies.active, true)),
    db
      .select()
      .from(schema.dues)
      .where(and(eq(schema.dues.status, "open"), lte(schema.dues.dueDate, until))),
  ]);
  const out: Reminder[] = [];
  for (const l of loans) {
    if (l.direction !== "taken" || !l.emiDay) continue;
    const d = nextEmiDate(l.emiDay, from);
    if (d <= until) out.push({ date: d, kind: "EMI", title: `${l.party}${l.purpose ? ` (${l.purpose})` : ""}`, amount: toNum(l.emi), href: "/loans" });
  }
  for (const p of policies) {
    if (p.nextDueDate && p.nextDueDate <= until)
      out.push({ date: p.nextDueDate, kind: "Premium", title: `${p.insurer} ${p.planName ?? p.type}`, amount: toNum(p.premium), href: "/insurance" });
    if (p.maturityDate && p.maturityDate >= from && p.maturityDate <= until)
      out.push({ date: p.maturityDate, kind: "Maturity", title: `${p.insurer} ${p.planName ?? p.type}`, amount: toNum(p.sumAssured), href: "/insurance" });
  }
  for (const d of dues) {
    out.push({
      date: d.dueDate,
      kind: d.kind === "payable" ? "Payable" : "Receivable",
      title: `${d.party}: ${d.description}`,
      amount: toNum(d.amount),
      href: "/dues",
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export async function accountBalances() {
  const rows = await db
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
      type: schema.accounts.type,
      institution: schema.accounts.institution,
      last4: schema.accounts.last4,
      opening: schema.accounts.openingBalance,
      net: sql<string>`coalesce(sum(case when ${schema.transactions.direction} = 'in' then ${schema.transactions.amount} else -${schema.transactions.amount} end), 0)`,
    })
    .from(schema.accounts)
    .leftJoin(schema.transactions, eq(schema.transactions.accountId, schema.accounts.id))
    .where(eq(schema.accounts.archived, false))
    .groupBy(schema.accounts.id)
    .orderBy(asc(schema.accounts.name));
  return rows.map((r) => ({ ...r, balance: toNum(r.opening) + toNum(r.net) }));
}

// Posted totals per head kind and direction in a date range.
export async function totalsByKind(start: string, end: string) {
  const rows = await db
    .select({
      kind: schema.heads.kind,
      direction: schema.transactions.direction,
      total: sql<string>`sum(${schema.transactions.amount})`,
    })
    .from(schema.transactions)
    .innerJoin(schema.heads, eq(schema.heads.id, schema.transactions.headId))
    .where(and(eq(schema.transactions.status, "posted"), gte(schema.transactions.date, start), lte(schema.transactions.date, end)))
    .groupBy(schema.heads.kind, schema.transactions.direction);
  const get = (kind: string, dir: string) => toNum(rows.find((r) => r.kind === kind && r.direction === dir)?.total);
  return {
    // Refunds on expense heads net off expenses; reversals on income heads net off income.
    income: get("income", "in") - get("income", "out"),
    expense: get("expense", "out") - get("expense", "in"),
    invested: get("investment", "out") - get("investment", "in"),
    loanPaid: get("loan", "out"),
    loanReceived: get("loan", "in"),
  };
}

export async function monthlySeries(start: string, end: string) {
  const rows = await db
    .select({
      month: sql<string>`to_char(${schema.transactions.date}, 'YYYY-MM')`,
      kind: schema.heads.kind,
      net: sql<string>`sum(case when ${schema.transactions.direction} = 'in' then ${schema.transactions.amount} else -${schema.transactions.amount} end)`,
    })
    .from(schema.transactions)
    .innerJoin(schema.heads, eq(schema.heads.id, schema.transactions.headId))
    .where(and(eq(schema.transactions.status, "posted"), gte(schema.transactions.date, start), lte(schema.transactions.date, end)))
    .groupBy(sql`1`, schema.heads.kind);
  const months: string[] = [];
  for (let d = start.slice(0, 7); d <= end.slice(0, 7); ) {
    months.push(d);
    const [y, m] = d.split("-").map(Number);
    d = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return months.map((m) => ({
    month: m,
    income: toNum(rows.find((r) => r.month === m && r.kind === "income")?.net),
    expense: -toNum(rows.find((r) => r.month === m && r.kind === "expense")?.net),
  }));
}

export async function expenseByHead(start: string, end: string) {
  const rows = await db
    .select({
      head: schema.heads.name,
      total: sql<string>`sum(case when ${schema.transactions.direction} = 'out' then ${schema.transactions.amount} else -${schema.transactions.amount} end)`,
    })
    .from(schema.transactions)
    .innerJoin(schema.heads, eq(schema.heads.id, schema.transactions.headId))
    .where(
      and(
        eq(schema.transactions.status, "posted"),
        eq(schema.heads.kind, "expense"),
        gte(schema.transactions.date, start),
        lte(schema.transactions.date, end),
      ),
    )
    .groupBy(schema.heads.name);
  return rows.map((r) => ({ head: r.head, total: toNum(r.total) })).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
}
