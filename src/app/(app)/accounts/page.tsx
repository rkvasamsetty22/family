import { archiveAccount, createAccount } from "@/app/actions/masters";
import { accountBalances } from "@/lib/queries";
import { Empty, Field, Select } from "@/components/fields";
import { money } from "@/lib/format";

const ACCOUNT_TYPES = [
  { value: "bank", label: "Bank account" },
  { value: "credit_card", label: "Credit card" },
  { value: "wallet", label: "Wallet / UPI" },
  { value: "cash", label: "Cash" },
];
const typeLabel = Object.fromEntries(ACCOUNT_TYPES.map((t) => [t.value, t.label]));

export default async function AccountsPage() {
  const accounts = await accountBalances();
  const total = accounts.filter((a) => a.type !== "credit_card").reduce((s, a) => s + a.balance, 0);
  return (
    <div className="max-w-4xl">
      <h1 className="page-title">Accounts</h1>
      <p className="page-sub">Bank accounts, cards, wallets and cash. Balance = opening balance plus every transaction recorded.</p>
      <div className="card mb-4 overflow-x-auto">
        {accounts.length === 0 ? (
          <Empty>No accounts yet.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Bank</th>
                <th className="num">Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.name} {a.last4 && <span className="text-ink-3">••{a.last4}</span>}
                  </td>
                  <td className="text-ink-2">{typeLabel[a.type]}</td>
                  <td className="text-ink-2">{a.institution}</td>
                  <td className={`num ${a.balance < 0 ? "text-bad" : ""}`}>{money(a.balance, true)}</td>
                  <td>
                    <form action={archiveAccount}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="btn-danger">Archive</button>
                    </form>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="font-medium">Total (excluding cards)</td>
                <td className="num font-medium">{money(total, true)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
      <form action={createAccount} className="card grid gap-3 md:grid-cols-3">
        <div className="card-title md:col-span-3">Add account</div>
        <Field label="Name">
          <input name="name" required className="input" placeholder="SBI Savings" />
        </Field>
        <Field label="Type">
          <Select name="type" options={ACCOUNT_TYPES} />
        </Field>
        <Field label="Bank / issuer">
          <input name="institution" className="input" placeholder="SBI" />
        </Field>
        <Field label="Last 4 digits">
          <input name="last4" maxLength={4} inputMode="numeric" className="input" />
        </Field>
        <Field label="Opening balance (₹)">
          <input name="openingBalance" inputMode="decimal" className="input" placeholder="Balance before first imported line" />
        </Field>
        <Field label="As of">
          <input type="date" name="openingDate" className="input" />
        </Field>
        <div>
          <button className="btn">Add account</button>
        </div>
      </form>
    </div>
  );
}
