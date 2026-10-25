import { db, schema } from "@/db";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { accountBalances, totalsByKind } from "./queries";
import { addMonths, todayIST } from "./dates";
import { fmtDate, toNum } from "./format";
import { REPORTS, REPORT_IDS, monthLabel, type Cell, type Period, type ReportId, type Report, type Section } from "./report-period";

export * from "./report-period";
import { HEAD_KIND_LABEL } from "./heads";

// ---------- Queries ----------

const posted = (from: string, to: string) =>
  and(eq(schema.transactions.status, "posted"), gte(schema.transactions.date, from), lte(schema.transactions.date, to));

async function headTotals(from: string, to: string) {
  const rows = await db
    .select({
      head: schema.heads.name,
      kind: schema.heads.kind,
      entries: sql<number>`count(*)::int`,
      inflow: sql<string>`coalesce(sum(case when ${schema.transactions.direction} = 'in' then ${schema.transactions.amount} end), 0)`,
      outflow: sql<string>`coalesce(sum(case when ${schema.transactions.direction} = 'out' then ${schema.transactions.amount} end), 0)`,
    })
    .from(schema.transactions)
    .innerJoin(schema.heads, eq(schema.heads.id, schema.transactions.headId))
    .where(posted(from, to))
    .groupBy(schema.heads.name, schema.heads.kind)
    .orderBy(asc(schema.heads.kind), asc(schema.heads.name));
  return rows.map((r) => ({ ...r, inflow: toNum(r.inflow), outflow: toNum(r.outflow) }));
}

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "");

async function summary(from: string, to: string): Promise<Section[]> {
  const [heads, t] = await Promise.all([headTotals(from, to), totalsByKind(from, to)]);
  const income = heads
    .filter((h) => h.kind === "income")
    .map((h) => ({ head: h.head, amount: h.inflow - h.outflow }))
    .filter((h) => h.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
  const expense = heads
    .filter((h) => h.kind === "expense")
    .map((h) => ({ head: h.head, amount: h.outflow - h.inflow }))
    .filter((h) => h.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
  const saved = t.income - t.expense;
  return [
    {
      title: "Summary",
      columns: [{ label: "Item" }, { label: "Amount", money: true }],
      rows: [
        ["Total income", t.income],
        ["Total expenses", t.expense],
        ["Saved (income minus expenses)", saved],
        ["Savings rate", pct(saved, t.income) || "—"],
        ["Invested (net)", t.invested],
        ["Loan EMIs and repayments paid", t.loanPaid],
        ["Loans received", t.loanReceived],
      ],
      kinds: ["income", "expense", null, null, "investment", "loan", "loan"],
    },
    {
      title: "Income by head",
      columns: [{ label: "Head" }, { label: "Amount", money: true }, { label: "Share", align: "right" }],
      rows: income.map((r) => [r.head, r.amount, pct(r.amount, t.income)]),
      kinds: income.map(() => "income"),
      total: ["Total income", t.income, ""],
      empty: "No income filed in this period.",
    },
    {
      title: "Expenses by head",
      columns: [{ label: "Head" }, { label: "Amount", money: true }, { label: "Share", align: "right" }],
      rows: expense.map((r) => [r.head, r.amount, pct(r.amount, t.expense)]),
      kinds: expense.map(() => "expense"),
      total: ["Total expenses", t.expense, ""],
      empty: "No expenses filed in this period.",
    },
  ];
}

async function monthly(from: string, to: string): Promise<Section[]> {
  const rows = await db
    .select({
      month: sql<string>`to_char(${schema.transactions.date}, 'YYYY-MM')`,
      kind: schema.heads.kind,
      direction: schema.transactions.direction,
      total: sql<string>`sum(${schema.transactions.amount})`,
    })
    .from(schema.transactions)
    .innerJoin(schema.heads, eq(schema.heads.id, schema.transactions.headId))
    .where(posted(from, to))
    .groupBy(sql`1`, schema.heads.kind, schema.transactions.direction);
  const get = (m: string, k: string, d: string) => toNum(rows.find((r) => r.month === m && r.kind === k && r.direction === d)?.total);
  const out: Cell[][] = [];
  const sum = [0, 0, 0, 0, 0];
  // Stop at the current month so a full-year report does not list empty future months.
  const last = (to < todayIST() ? to : todayIST()).slice(0, 7);
  for (let m = from.slice(0, 7); m <= last; m = addMonths(m + "-01", 1).slice(0, 7)) {
    const inc = get(m, "income", "in") - get(m, "income", "out");
    const exp = get(m, "expense", "out") - get(m, "expense", "in");
    const inv = get(m, "investment", "out") - get(m, "investment", "in");
    const emi = get(m, "loan", "out");
    const v = [inc, exp, inc - exp, inv, emi];
    v.forEach((x, i) => (sum[i] += x));
    out.push([monthLabel(m + "-01"), ...v]);
  }
  return [
    {
      title: "Month by month",
      columns: [
        { label: "Month" },
        { label: "Income", money: true },
        { label: "Expenses", money: true },
        { label: "Saved", money: true },
        { label: "Invested", money: true },
        { label: "EMIs paid", money: true },
      ],
      rows: out,
      total: ["Total", ...sum],
      empty: "No months in this period yet.",
    },
  ];
}

async function byHead(from: string, to: string): Promise<Section[]> {
  const heads = await headTotals(from, to);
  const tin = heads.reduce((s, h) => s + h.inflow, 0);
  const tout = heads.reduce((s, h) => s + h.outflow, 0);
  return [
    {
      title: "Totals by head",
      columns: [
        { label: "Head" },
        { label: "Type" },
        { label: "Entries", align: "right" },
        { label: "Money in", money: true },
        { label: "Money out", money: true },
        { label: "Net", money: true },
      ],
      rows: heads.map((h) => [h.head, HEAD_KIND_LABEL[h.kind] ?? h.kind, h.entries, h.inflow, h.outflow, h.inflow - h.outflow]),
      kinds: heads.map((h) => h.kind),
      total: ["Total", "", heads.reduce((s, h) => s + h.entries, 0), tin, tout, tin - tout],
      empty: "Nothing filed in this period.",
    },
  ];
}

async function transactions(from: string, to: string): Promise<Section[]> {
  const rows = await db
    .select({
      date: schema.transactions.date,
      description: schema.transactions.description,
      account: schema.accounts.name,
      head: schema.heads.name,
      kind: schema.heads.kind,
      member: schema.transactions.member,
      direction: schema.transactions.direction,
      amount: schema.transactions.amount,
      status: schema.transactions.status,
    })
    .from(schema.transactions)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.transactions.accountId))
    .leftJoin(schema.heads, eq(schema.heads.id, schema.transactions.headId))
    .where(and(gte(schema.transactions.date, from), lte(schema.transactions.date, to)))
    .orderBy(asc(schema.transactions.date), asc(schema.transactions.id));
  let tin = 0;
  let tout = 0;
  const out = rows.map((r) => {
    const a = toNum(r.amount);
    if (r.direction === "in") tin += a;
    else tout += a;
    return [
      fmtDate(r.date),
      r.description,
      r.account,
      r.status === "pending" ? `${r.head ?? "—"} (to review)` : r.head ?? "—",
      r.kind ? HEAD_KIND_LABEL[r.kind] ?? r.kind : "",
      r.member ?? "",
      r.direction === "in" ? a : null,
      r.direction === "out" ? a : null,
    ];
  });
  return [
    {
      title: "Transactions",
      columns: [
        { label: "Date" },
        { label: "Description" },
        { label: "Account" },
        { label: "Head" },
        { label: "Type" },
        { label: "Member" },
        { label: "In", money: true },
        { label: "Out", money: true },
      ],
      rows: out,
      kinds: rows.map((r) => r.kind ?? r.direction),
      total: [`${rows.length} entries`, "", "", "", "", "", tin, tout],
      empty: "No transactions in this period.",
    },
  ];
}

const FREQ_LABEL: Record<string, string> = { monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-yearly", yearly: "Yearly", single: "Single" };
const POLICY_TYPE: Record<string, string> = { term: "Term life", life: "Life", health: "Health", vehicle: "Vehicle", property: "Property", other: "Other" };
const ACCOUNT_TYPE: Record<string, string> = { bank: "Bank", credit_card: "Credit card", wallet: "Wallet / UPI", cash: "Cash" };

async function position(): Promise<Section[]> {
  const [balances, loans, dues, policies] = await Promise.all([
    accountBalances(),
    db.select().from(schema.loans).where(eq(schema.loans.closed, false)).orderBy(asc(schema.loans.party)),
    db.select().from(schema.dues).where(eq(schema.dues.status, "open")).orderBy(asc(schema.dues.dueDate)),
    db.select().from(schema.policies).where(eq(schema.policies.active, true)).orderBy(asc(schema.policies.nextDueDate)),
  ]);
  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
  const loanSection = (direction: "taken" | "given", title: string, party: string): Section => {
    const ls = loans.filter((l) => l.direction === direction);
    return {
      title,
      columns: [{ label: party }, { label: "Purpose" }, { label: "Rate", align: "right" }, { label: "EMI", money: true }, { label: "Outstanding", money: true }],
      rows: ls.map((l) => [l.party, l.purpose ?? "", Number(l.ratePct) ? `${Number(l.ratePct)}%` : "", l.emi ? toNum(l.emi) : null, toNum(l.outstanding)]),
      kinds: ls.map(() => "loan"),
      total: ["Total", "", "", sum(ls, (l) => toNum(l.emi)), sum(ls, (l) => toNum(l.outstanding))],
      empty: direction === "taken" ? "No open loans." : "No money lent out.",
    };
  };
  const dueSection = (kind: "payable" | "receivable", title: string): Section => {
    const ds = dues.filter((d) => d.kind === kind);
    return {
      title,
      columns: [{ label: "Due" }, { label: "Party" }, { label: "For" }, { label: "Amount", money: true }],
      rows: ds.map((d) => [fmtDate(d.dueDate), d.party, d.description, toNum(d.amount)]),
      kinds: ds.map(() => (kind === "payable" ? "out" : "in")),
      total: ["Total", "", "", sum(ds, (d) => toNum(d.amount))],
      empty: "Nothing open.",
    };
  };
  const liquid = balances.filter((b) => b.type !== "credit_card");
  return [
    {
      title: "Accounts",
      columns: [{ label: "Account" }, { label: "Type" }, { label: "Bank" }, { label: "Balance", money: true }],
      rows: balances.map((b) => [b.name, ACCOUNT_TYPE[b.type] ?? b.type, b.institution ?? "", b.balance]),
      total: ["Total (excluding cards)", "", "", sum(liquid, (b) => b.balance)],
      empty: "No accounts.",
    },
    loanSection("taken", "Loans taken", "Lender"),
    loanSection("given", "Loans given", "Borrower"),
    dueSection("payable", "Open payables"),
    dueSection("receivable", "Open receivables"),
    {
      // Policy numbers are deliberately left out of reports.
      title: "Insurance in force",
      columns: [
        { label: "Policy" },
        { label: "Type" },
        { label: "Insured" },
        { label: "Cover", money: true },
        { label: "Premium", money: true },
        { label: "Frequency" },
        { label: "Next due" },
      ],
      rows: policies.map((p) => [
        [p.insurer, p.planName].filter(Boolean).join(" "),
        POLICY_TYPE[p.type] ?? p.type,
        p.insured ?? "",
        p.sumAssured ? toNum(p.sumAssured) : null,
        p.premium ? toNum(p.premium) : null,
        FREQ_LABEL[p.frequency] ?? p.frequency,
        fmtDate(p.nextDueDate),
      ]),
      total: ["Total", "", "", sum(policies, (p) => toNum(p.sumAssured)), null, "", ""],
      empty: "No active policies.",
    },
  ];
}

export async function buildReport(id: ReportId | "all", period: Period): Promise<Report> {
  const { from, to } = period;
  const build: Record<ReportId, () => Promise<Section[]>> = {
    summary: () => summary(from, to),
    monthly: () => monthly(from, to),
    heads: () => byHead(from, to),
    transactions: () => transactions(from, to),
    position: () => position(),
  };
  if (id === "all") {
    const parts = await Promise.all(REPORT_IDS.map((r) => build[r]()));
    return { id, title: "Family finance report", period: period.label, sections: parts.flat() };
  }
  const meta = REPORTS.find((r) => r.id === id)!;
  return {
    id,
    title: meta.label,
    period: id === "position" ? `As of ${fmtDate(todayIST())}` : period.label,
    sections: await build[id](),
  };
}
