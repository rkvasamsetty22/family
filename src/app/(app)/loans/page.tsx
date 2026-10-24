import { db, schema } from "@/db";
import { asc } from "drizzle-orm";
import { createLoan, deleteLoan, updateLoanOutstanding } from "@/app/actions/masters";
import { Empty, Field, Select } from "@/components/fields";
import { fmtDate, money } from "@/lib/format";
import { decrypt, mask } from "@/lib/crypto";
import { nextEmiDate } from "@/lib/dates";

type Loan = typeof schema.loans.$inferSelect;

function LoanTable({ loans, given }: { loans: Loan[]; given?: boolean }) {
  if (!loans.length) return <Empty>{given ? "No money lent out." : "No loans."}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="tbl min-w-[760px]">
        <thead>
          <tr>
            <th>{given ? "Borrower" : "Lender"}</th>
            <th className="num">Principal</th>
            <th className="num">Rate</th>
            <th className="num">EMI</th>
            <th>Next due</th>
            <th className="num">Outstanding</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loans.map((l) => (
            <tr key={l.id} className={l.closed ? "opacity-50" : ""}>
              <td>
                <div>{l.party}</div>
                <div className="text-xs text-ink-3">
                  {[l.purpose, mask(decrypt(l.accountRefEnc)), l.startDate && `since ${fmtDate(l.startDate)}`].filter(Boolean).join(" · ")}
                </div>
              </td>
              <td className="num">{money(l.principal)}</td>
              <td className="num">{Number(l.ratePct) ? `${Number(l.ratePct)}%` : "—"}</td>
              <td className="num">{l.emi ? money(l.emi) : "—"}</td>
              <td className="whitespace-nowrap">{!l.closed && l.emiDay ? fmtDate(nextEmiDate(l.emiDay)) : "—"}</td>
              <td className="num">
                <form action={updateLoanOutstanding} className="flex justify-end gap-1">
                  <input type="hidden" name="id" value={l.id} />
                  <input name="outstanding" defaultValue={Number(l.outstanding)} className="input w-28 text-right" aria-label="Outstanding" />
                  <button className="btn-ghost text-xs" title="Update outstanding">✓</button>
                </form>
              </td>
              <td>
                <form action={deleteLoan}>
                  <input type="hidden" name="id" value={l.id} />
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

export default async function LoansPage() {
  const loans = await db.select().from(schema.loans).orderBy(asc(schema.loans.closed), asc(schema.loans.party));
  const taken = loans.filter((l) => l.direction === "taken");
  const given = loans.filter((l) => l.direction === "given");
  const sum = (ls: Loan[]) => ls.filter((l) => !l.closed).reduce((s, l) => s + Number(l.outstanding), 0);
  return (
    <div className="max-w-5xl">
      <h1 className="page-title">Loans</h1>
      <p className="page-sub">
        Home, vehicle, personal and gold loans, hand loans from people, and money you have lent. Link an EMI line to its loan in the review queue and the outstanding drops by the principal part automatically.
      </p>
      <div className="card mb-4">
        <div className="card-title">Borrowings · outstanding {money(sum(taken))}</div>
        <LoanTable loans={taken} />
      </div>
      <div className="card mb-4">
        <div className="card-title">Loans given · to receive {money(sum(given))}</div>
        <LoanTable loans={given} given />
      </div>
      <form action={createLoan} className="card grid gap-3 md:grid-cols-4">
        <div className="card-title md:col-span-4">Add loan</div>
        <Field label="Type">
          <Select name="direction" options={[{ value: "taken", label: "Borrowed (I owe)" }, { value: "given", label: "Lent (owed to me)" }]} />
        </Field>
        <Field label="Lender / borrower">
          <input name="party" required className="input" placeholder="HDFC Home Loan / Ramesh" />
        </Field>
        <Field label="Purpose">
          <input name="purpose" className="input" placeholder="House, car, gold, personal" />
        </Field>
        <Field label="Loan account no. (stored encrypted)">
          <input name="accountRef" className="input" />
        </Field>
        <Field label="Principal (₹)">
          <input name="principal" required inputMode="decimal" className="input" />
        </Field>
        <Field label="Outstanding now (₹)">
          <input name="outstanding" inputMode="decimal" className="input" placeholder="Defaults to principal" />
        </Field>
        <Field label="Interest % p.a.">
          <input name="ratePct" inputMode="decimal" className="input" />
        </Field>
        <Field label="Start date">
          <input type="date" name="startDate" className="input" />
        </Field>
        <Field label="Tenure (months)">
          <input name="tenureMonths" inputMode="numeric" className="input" />
        </Field>
        <Field label="EMI (₹)">
          <input name="emi" inputMode="decimal" className="input" />
        </Field>
        <Field label="EMI day of month">
          <input name="emiDay" type="number" min={1} max={31} className="input" />
        </Field>
        <Field label="Notes">
          <input name="notes" className="input" />
        </Field>
        <div>
          <button className="btn">Add loan</button>
        </div>
      </form>
    </div>
  );
}
