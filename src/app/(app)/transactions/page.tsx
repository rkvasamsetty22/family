import { db, schema } from "@/db";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { addManualTransaction, deleteTransaction, updateTransaction } from "@/app/actions/ledger";
import { listAccounts, listActivePolicies, listHeads, listOpenLoans } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { Amount, Empty, Field, HeadSelect, KindChip, Select } from "@/components/fields";
import { Tabs, pickTab } from "@/components/tabs";
import { fmtDate, money } from "@/lib/format";
import { todayIST } from "@/lib/dates";

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; account?: string; head?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayIST().slice(0, 7);
  const { start, end } = monthBounds(month);
  const where: SQL[] = [gte(schema.transactions.date, start), lte(schema.transactions.date, end)];
  if (sp.account) where.push(eq(schema.transactions.accountId, Number(sp.account)));
  if (sp.head) where.push(eq(schema.transactions.headId, Number(sp.head)));

  const [rows, heads, accounts, loans, policies, settings, allHeads] = await Promise.all([
    db
      .select()
      .from(schema.transactions)
      .where(and(...where))
      .orderBy(desc(schema.transactions.date), desc(schema.transactions.id)),
    listHeads(),
    listAccounts(),
    listOpenLoans(),
    listActivePolicies(),
    getSettings(),
    db.select({ id: schema.heads.id, kind: schema.heads.kind }).from(schema.heads),
  ]);
  const headMap = new Map(heads.map((h) => [h.id, h]));
  // Includes archived heads so old entries keep their type.
  const headKind = new Map(allHeads.map((h) => [h.id, h.kind]));
  const kindOf = (t: (typeof rows)[number]) => (t.headId ? headKind.get(t.headId) ?? null : null);
  const TABS = [
    { id: "all", label: "All" },
    { id: "income", label: "Income" },
    { id: "expense", label: "Expenses" },
    { id: "investment", label: "Investments" },
    { id: "loan", label: "Loans & EMIs" },
    { id: "transfer", label: "Transfers" },
    { id: "unfiled", label: "Unfiled" },
  ] as const;
  const tab = pickTab(sp.tab, TABS.map((t) => t.id));
  const inTab = (t: (typeof rows)[number], id: string) => (id === "all" ? true : id === "unfiled" ? !kindOf(t) : kindOf(t) === id);
  const allRows = rows;
  const acct = new Map(accounts.map((a) => [a.id, a.name]));
  const members = settings.members.split(",").map((m) => m.trim()).filter(Boolean);
  const cash = accounts.find((a) => a.type === "cash");
  const shown = allRows.filter((t) => inTab(t, tab));
  const inflow = shown.filter((r) => r.direction === "in").reduce((s, r) => s + Number(r.amount), 0);
  const outflow = shown.filter((r) => r.direction === "out").reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="max-w-6xl">
      <h1 className="page-title">Ledger</h1>
      <p className="page-sub">All transactions. Add cash income or expenses here; bank lines come in through imports.</p>

      <details className="card mb-4" open={allRows.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold">Add a cash or manual entry</summary>
        <form action={addManualTransaction} className="mt-3 grid gap-3 md:grid-cols-4">
          <Field label="Date">
            <input type="date" name="date" defaultValue={todayIST()} required className="input" />
          </Field>
          <Field label="Type">
            <Select name="direction" options={[{ value: "out", label: "Expense / paid" }, { value: "in", label: "Income / received" }]} />
          </Field>
          <Field label="Amount (₹)">
            <input name="amount" inputMode="decimal" required className="input" />
          </Field>
          <Field label="Account">
            <Select name="accountId" required defaultValue={cash?.id} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          </Field>
          <Field label="Description" className="md:col-span-2">
            <input name="description" required className="input" placeholder="e.g. Rent from tenant, vegetables" />
          </Field>
          <Field label="Head">
            <HeadSelect heads={heads} required />
          </Field>
          <Field label="Member">
            <Select name="member" placeholder="—" options={members.map((m) => ({ value: m, label: m }))} />
          </Field>
          {loans.length > 0 && (
            <Field label="Loan (optional)">
              <Select name="loanId" placeholder="—" options={loans.map((l) => ({ value: l.id, label: l.party }))} />
            </Field>
          )}
          {policies.length > 0 && (
            <Field label="Policy (optional)">
              <Select name="policyId" placeholder="—" options={policies.map((p) => ({ value: p.id, label: `${p.insurer} ${p.planName ?? p.type}` }))} />
            </Field>
          )}
          <Field label="Notes" className="md:col-span-2">
            <input name="notes" className="input" />
          </Field>
          <div className="flex items-end">
            <button className="btn">Add entry</button>
          </div>
        </form>
      </details>

      <form className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="Month">
          <input type="month" name="month" defaultValue={month} className="input" />
        </Field>
        <Field label="Account">
          <Select name="account" placeholder="All" defaultValue={sp.account} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
        </Field>
        <Field label="Head">
          <Select name="head" placeholder="All" defaultValue={sp.head} options={heads.map((h) => ({ value: h.id, label: h.name }))} />
        </Field>
        <button className="btn-ghost">Filter</button>
      </form>

      <Tabs
        tabs={TABS.map((t) => ({ ...t, count: allRows.filter((r) => inTab(r, t.id)).length }))}
        active={tab}
        base="/transactions"
        params={{ month, account: sp.account, head: sp.head }}
      />

      <div className="card overflow-x-auto">
        <div className="mb-2 flex flex-wrap gap-4 text-sm">
          <span>In: <strong className="text-good">{money(inflow)}</strong></span>
          <span>Out: <strong>{money(outflow)}</strong></span>
          <span className="text-ink-3">{shown.length} entries</span>
        </div>
        {shown.length === 0 ? (
          <Empty>No transactions here for this month.</Empty>
        ) : (
          <table className="tbl min-w-[820px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Account</th>
                <th>Type</th>
                <th>Head</th>
                <th className="num">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id} data-kind={kindOf(t) ?? t.direction} className="kind-row">
                  <td className="whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="max-w-xs break-words">
                    {t.description}
                    {t.member && <span className="ml-1 text-xs text-ink-3">· {t.member}</span>}
                    {t.status === "pending" && <span className="ml-1 rounded bg-bg px-1 text-xs text-warn">to review</span>}
                  </td>
                  <td className="whitespace-nowrap text-ink-2">{acct.get(t.accountId)}</td>
                  <td>{kindOf(t) ? <KindChip kind={kindOf(t)} /> : <span className="text-xs text-ink-3">Unfiled</span>}</td>
                  <td>
                    <form action={updateTransaction} className="flex gap-1">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="member" value={t.member ?? ""} />
                      <input type="hidden" name="notes" value={t.notes ?? ""} />
                      <HeadSelect heads={heads} defaultValue={t.headId} direction={t.direction} />
                      <button className="btn-ghost text-xs" title="Save head">✓</button>
                    </form>
                    {t.headId && !headMap.has(t.headId) && <span className="text-xs text-ink-3">archived head</span>}
                  </td>
                  <td className="num">
                    <Amount value={t.amount} direction={t.direction} />
                  </td>
                  <td>
                    <form action={deleteTransaction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="btn-danger" title="Delete">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
