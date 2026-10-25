import Link from "next/link";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { REMINDER_KIND, accountBalances, expenseByHead, monthlySeries, totalsByKind, upcomingReminders } from "@/lib/queries";
import { pendingCount } from "@/lib/posting";
import { fyRange, daysBetween, todayIST } from "@/lib/dates";
import { fmtDate, money, moneyShort } from "@/lib/format";
import { IncomeExpenseChart } from "@/components/charts";
import { HeadBars } from "@/components/head-bars";
import { Empty } from "@/components/fields";

function Tile({ label, value, sub, tone, kind }: { label: string; value: string; sub?: string; tone?: "good" | "bad"; kind?: string }) {
  return (
    <div className="tile" data-kind={kind}>
      <div className="tile-label">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export default async function Dashboard() {
  const today = todayIST();
  const fy = fyRange(today);
  const [totals, series, byHead, balances, pending, reminders, loans, dues, policies] = await Promise.all([
    totalsByKind(fy.start, fy.end),
    monthlySeries(fy.start, today),
    expenseByHead(fy.start, fy.end),
    accountBalances(),
    pendingCount(),
    upcomingReminders(30, today),
    db.select().from(schema.loans).where(eq(schema.loans.closed, false)),
    db.select().from(schema.dues).where(eq(schema.dues.status, "open")),
    db.select().from(schema.policies).where(eq(schema.policies.active, true)),
  ]);

  if (balances.length <= 1 && totals.income === 0 && totals.expense === 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="page-title">Welcome to Family Finance Manager</h1>
        <p className="page-sub">Four steps to get your family&apos;s finances in one place:</p>
        <ol className="card list-decimal space-y-2 pl-8 text-sm">
          <li><Link href="/accounts" className="text-accent underline">Add your bank accounts and cards</Link> with their opening balances.</li>
          <li><Link href="/import" className="text-accent underline">Import a statement</Link> and file each line in the <Link href="/review" className="text-accent underline">review queue</Link>.</li>
          <li>Add <Link href="/loans" className="text-accent underline">loans</Link>, <Link href="/insurance" className="text-accent underline">insurance policies</Link> and <Link href="/dues" className="text-accent underline">dues</Link> so due dates show up.</li>
          <li>Record cash income and spending in the <Link href="/transactions" className="text-accent underline">ledger</Link>.</li>
        </ol>
      </div>
    );
  }

  const savings = totals.income - totals.expense;
  const rate = totals.income > 0 ? Math.round((savings / totals.income) * 100) : null;
  const liquid = balances.filter((b) => b.type !== "credit_card").reduce((s, b) => s + b.balance, 0);
  const cardDues = balances.filter((b) => b.type === "credit_card").reduce((s, b) => s + Math.min(0, b.balance), 0);
  const borrowed = loans.filter((l) => l.direction === "taken").reduce((s, l) => s + Number(l.outstanding), 0);
  const lent = loans.filter((l) => l.direction === "given").reduce((s, l) => s + Number(l.outstanding), 0);
  const receivable = dues.filter((d) => d.kind === "receivable").reduce((s, d) => s + Number(d.amount), 0);
  const payable = dues.filter((d) => d.kind === "payable").reduce((s, d) => s + Number(d.amount), 0);
  const lifeCover = policies.filter((p) => p.type === "term" || p.type === "life").reduce((s, p) => s + Number(p.sumAssured ?? 0), 0);
  const healthCover = policies.filter((p) => p.type === "health").reduce((s, p) => s + Number(p.sumAssured ?? 0), 0);
  const top = byHead.slice(0, 8);
  const rest = byHead.slice(8).reduce((s, r) => s + r.total, 0);
  if (rest > 0) top.push({ head: "All other heads", total: rest });

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-ink-2">{fy.label} (April to March) · as of {fmtDate(today)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/reports" className="btn-ghost">Reports</Link>
          {pending > 0 && (
            <Link href="/review" className="btn">
              {pending} {pending === 1 ? "transaction" : "transactions"} to review
            </Link>
          )}
        </div>
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">This financial year</h2>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile kind="income" label="Income" value={moneyShort(totals.income)} />
        <Tile kind="expense" label="Expenses" value={moneyShort(totals.expense)} />
        <Tile label="Saved" value={moneyShort(savings)} sub={rate != null ? `${rate}% of income` : undefined} tone={savings < 0 ? "bad" : "good"} />
        <Tile kind="investment" label="Invested" value={moneyShort(totals.invested)} sub={`EMIs paid ${moneyShort(totals.loanPaid)}`} />
      </div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Position today</h2>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div data-tone="accounts"><Tile label="Bank & cash balance" value={moneyShort(liquid)} sub={cardDues < 0 ? `Card dues ${moneyShort(-cardDues)}` : undefined} /></div>
        <Tile kind="loan" label="Loans outstanding" value={moneyShort(borrowed)} tone={borrowed > 0 ? "bad" : undefined} />
        <Tile kind="income" label="Lent out + receivable" value={moneyShort(lent + receivable)} />
        <Tile kind="expense" label="Payables open" value={moneyShort(payable)} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-5">
        <div className="card lg:col-span-3">
          <div className="card-title">Income vs expenses by month</div>
          <IncomeExpenseChart data={series} />
        </div>
        <div className="card lg:col-span-2">
          <div className="card-title">Where the money went this FY</div>
          {top.length ? <HeadBars data={top} /> : <Empty>No expenses filed yet.</Empty>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card lg:col-span-3">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="card-title mb-0">Due in the next 30 days</div>
            <Link href="/reminders" className="text-xs text-accent">All due dates</Link>
          </div>
          {reminders.length === 0 ? (
            <Empty>Nothing due.</Empty>
          ) : (
            <table className="tbl">
              <tbody>
                {reminders.slice(0, 10).map((r, i) => {
                  const d = daysBetween(today, r.date);
                  return (
                    <tr key={i}>
                      <td className={`whitespace-nowrap ${d < 0 ? "text-bad" : d <= 7 ? "text-warn" : "text-ink-2"}`}>
                        {d < 0 ? "Overdue" : d === 0 ? "Today" : fmtDate(r.date)}
                      </td>
                      <td className="hidden sm:table-cell">
                        <span data-kind={REMINDER_KIND[r.kind]} className="kind-chip">{r.kind}</span>
                      </td>
                      <td>{r.title}</td>
                      <td className="num">{r.amount ? money(r.amount) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="card lg:col-span-2">
          <div className="card-title">Accounts</div>
          <table className="tbl mb-4">
            <tbody>
              {balances.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td className={`num ${b.balance < 0 ? "text-bad" : ""}`}>{money(b.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card-title">Insurance cover</div>
          <div className="text-sm">
            Life {moneyShort(lifeCover)} · Health {moneyShort(healthCover)}
            {policies.length === 0 && (
              <span className="text-ink-3"> · <Link href="/insurance" className="text-accent">add policies</Link></span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
