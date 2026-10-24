import { db, schema } from "@/db";
import { asc, desc, eq } from "drizzle-orm";
import { createDue, deleteDue, settleDue } from "@/app/actions/masters";
import { Empty, Field, Select } from "@/components/fields";
import { fmtDate, money } from "@/lib/format";
import { todayIST } from "@/lib/dates";

type Due = typeof schema.dues.$inferSelect;
const RECURRENCE = [
  { value: "none", label: "One time" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half_yearly", label: "Half-yearly" },
  { value: "yearly", label: "Yearly" },
];

function DueTable({ rows, today }: { rows: Due[]; today: string }) {
  if (!rows.length) return <Empty>Nothing open.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="tbl min-w-[600px]">
        <thead>
          <tr>
            <th>Due</th>
            <th>Party</th>
            <th>For</th>
            <th className="num">Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td className={`whitespace-nowrap ${d.dueDate < today ? "font-medium text-bad" : ""}`}>
                {fmtDate(d.dueDate)}
                {d.dueDate < today && <span className="ml-1 text-xs">overdue</span>}
              </td>
              <td>{d.party}</td>
              <td>
                {d.description}
                {d.recurrence !== "none" && <span className="ml-1 text-xs text-ink-3">({d.recurrence.replace("_", "-")})</span>}
              </td>
              <td className="num">{money(d.amount)}</td>
              <td className="flex gap-1">
                <form action={settleDue}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="btn-ghost text-xs">{d.kind === "payable" ? "Paid" : "Received"}</button>
                </form>
                <form action={deleteDue}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="btn-danger">Delete</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function DuesPage() {
  const today = todayIST();
  const [open, settled] = await Promise.all([
    db.select().from(schema.dues).where(eq(schema.dues.status, "open")).orderBy(asc(schema.dues.dueDate)),
    db.select().from(schema.dues).where(eq(schema.dues.status, "paid")).orderBy(desc(schema.dues.paidOn)).limit(15),
  ]);
  const payables = open.filter((d) => d.kind === "payable");
  const receivables = open.filter((d) => d.kind === "receivable");
  const sum = (r: Due[]) => r.reduce((s, d) => s + Number(d.amount), 0);
  return (
    <div className="max-w-5xl">
      <h1 className="page-title">Payables & receivables</h1>
      <p className="page-sub">Bills, fees, taxes and anything else you owe, and money others owe you. Recurring ones roll forward when settled.</p>
      <div className="card mb-4">
        <div className="card-title">Payables · {money(sum(payables))}</div>
        <DueTable rows={payables} today={today} />
      </div>
      <div className="card mb-4">
        <div className="card-title">Receivables · {money(sum(receivables))}</div>
        <DueTable rows={receivables} today={today} />
      </div>
      <form action={createDue} className="card mb-4 grid gap-3 md:grid-cols-3">
        <div className="card-title md:col-span-3">Add</div>
        <Field label="Type">
          <Select name="kind" options={[{ value: "payable", label: "Payable (I owe)" }, { value: "receivable", label: "Receivable (owed to me)" }]} />
        </Field>
        <Field label="Party">
          <input name="party" required className="input" placeholder="School, landlord, tenant, friend" />
        </Field>
        <Field label="For">
          <input name="description" required className="input" placeholder="Term 2 fees, property tax, rent" />
        </Field>
        <Field label="Amount (₹)">
          <input name="amount" required inputMode="decimal" className="input" />
        </Field>
        <Field label="Due date">
          <input type="date" name="dueDate" required className="input" />
        </Field>
        <Field label="Repeats">
          <Select name="recurrence" options={RECURRENCE} />
        </Field>
        <div>
          <button className="btn">Add</button>
        </div>
      </form>
      {settled.length > 0 && (
        <div className="card">
          <div className="card-title">Recently settled</div>
          <table className="tbl">
            <tbody>
              {settled.map((d) => (
                <tr key={d.id} className="text-ink-2">
                  <td>{fmtDate(d.paidOn)}</td>
                  <td>{d.party}</td>
                  <td>{d.description}</td>
                  <td className="num">{money(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
