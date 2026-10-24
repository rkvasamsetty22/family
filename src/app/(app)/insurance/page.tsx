import { db, schema } from "@/db";
import { asc, desc } from "drizzle-orm";
import { createPolicy, deletePolicy, markPremiumPaid, setPolicyActive } from "@/app/actions/masters";
import { Empty, Field, Select } from "@/components/fields";
import { fmtDate, money, moneyShort } from "@/lib/format";
import { decrypt, mask } from "@/lib/crypto";
import { todayIST } from "@/lib/dates";

const TYPES = [
  { value: "term", label: "Term life" },
  { value: "life", label: "Life (endowment / ULIP / money-back)" },
  { value: "health", label: "Health" },
  { value: "vehicle", label: "Vehicle" },
  { value: "property", label: "Home / property" },
  { value: "other", label: "Other" },
];
const typeLabel = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));
const FREQ = [
  { value: "yearly", label: "Yearly" },
  { value: "half_yearly", label: "Half-yearly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "monthly", label: "Monthly" },
  { value: "single", label: "Single premium" },
];

export default async function InsurancePage() {
  const today = todayIST();
  const policies = await db.select().from(schema.policies).orderBy(desc(schema.policies.active), asc(schema.policies.nextDueDate));
  const active = policies.filter((p) => p.active);
  const cover = (types: string[]) => active.filter((p) => types.includes(p.type)).reduce((s, p) => s + Number(p.sumAssured ?? 0), 0);
  const yearlyPremium = active.reduce((s, p) => {
    const mult = { monthly: 12, quarterly: 4, half_yearly: 2, yearly: 1 }[p.frequency] ?? 0;
    return s + Number(p.premium ?? 0) * mult;
  }, 0);
  return (
    <div className="max-w-6xl">
      <h1 className="page-title">Insurance & policies</h1>
      <p className="page-sub">Life, health, vehicle and other policies with renewal dates. Link a premium payment to its policy in the review queue and the next due date moves forward automatically.</p>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Life cover", cover(["term", "life"])],
          ["Health cover", cover(["health"])],
          ["Vehicle / property", cover(["vehicle", "property"])],
          ["Premiums per year", yearlyPremium],
        ].map(([label, v]) => (
          <div key={label as string} className="card">
            <div className="text-xs text-ink-2">{label}</div>
            <div className="text-lg font-semibold">{moneyShort(v as number)}</div>
          </div>
        ))}
      </div>
      <div className="card mb-4 overflow-x-auto">
        {policies.length === 0 ? (
          <Empty>No policies yet.</Empty>
        ) : (
          <table className="tbl min-w-[860px]">
            <thead>
              <tr>
                <th>Policy</th>
                <th>Insured / nominee</th>
                <th className="num">Cover</th>
                <th className="num">Premium</th>
                <th>Next due</th>
                <th>Maturity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                  <td>
                    <div>{p.insurer} {p.planName}</div>
                    <div className="text-xs text-ink-3">{typeLabel[p.type]} {mask(decrypt(p.policyNumberEnc))}</div>
                  </td>
                  <td className="text-ink-2">
                    {p.insured}
                    {p.nominee && <div className="text-xs">Nominee: {p.nominee}</div>}
                  </td>
                  <td className="num">{p.sumAssured ? money(p.sumAssured) : "—"}</td>
                  <td className="num">
                    {p.premium ? money(p.premium) : "—"}
                    <div className="text-xs text-ink-3">{p.frequency.replace("_", "-")}</div>
                  </td>
                  <td className={`whitespace-nowrap ${p.active && p.nextDueDate && p.nextDueDate < today ? "font-medium text-bad" : ""}`}>{fmtDate(p.nextDueDate) || "—"}</td>
                  <td className="whitespace-nowrap">{fmtDate(p.maturityDate) || "—"}</td>
                  <td>
                    <div className="flex gap-1">
                      {p.active && p.nextDueDate && p.frequency !== "single" && (
                        <form action={markPremiumPaid}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="btn-ghost text-xs" title="Move next due date forward one period">Paid</button>
                        </form>
                      )}
                      <form action={setPolicyActive}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="active" value={String(!p.active)} />
                        <button className="btn-ghost text-xs">{p.active ? "Lapse" : "Revive"}</button>
                      </form>
                      <form action={deletePolicy}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn-danger">Delete</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <form action={createPolicy} className="card grid gap-3 md:grid-cols-4">
        <div className="card-title md:col-span-4">Add policy</div>
        <Field label="Type">
          <Select name="type" options={TYPES} />
        </Field>
        <Field label="Insurer">
          <input name="insurer" required className="input" placeholder="LIC, Star Health, ICICI Lombard" />
        </Field>
        <Field label="Plan name">
          <input name="planName" className="input" />
        </Field>
        <Field label="Policy number (stored encrypted)">
          <input name="policyNumber" className="input" />
        </Field>
        <Field label="Insured person(s)">
          <input name="insured" className="input" />
        </Field>
        <Field label="Sum assured / IDV (₹)">
          <input name="sumAssured" inputMode="decimal" className="input" />
        </Field>
        <Field label="Premium (₹)">
          <input name="premium" inputMode="decimal" className="input" />
        </Field>
        <Field label="Premium frequency">
          <Select name="frequency" options={FREQ} />
        </Field>
        <Field label="Next premium / renewal date">
          <input type="date" name="nextDueDate" className="input" />
        </Field>
        <Field label="Maturity date">
          <input type="date" name="maturityDate" className="input" />
        </Field>
        <Field label="Nominee">
          <input name="nominee" className="input" />
        </Field>
        <Field label="Notes">
          <input name="notes" className="input" />
        </Field>
        <div>
          <button className="btn">Add policy</button>
        </div>
      </form>
    </div>
  );
}
