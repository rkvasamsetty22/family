import Link from "next/link";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { importStatement } from "@/app/actions/ledger";
import { listAccounts } from "@/lib/queries";
import { aiEnabled } from "@/lib/ai";
import { Field, Select } from "@/components/fields";
import { SubmitButton } from "@/components/submit-button";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [accounts, recent] = await Promise.all([
    listAccounts(),
    db
      .select({ i: schema.imports, account: schema.accounts.name })
      .from(schema.imports)
      .innerJoin(schema.accounts, eq(schema.accounts.id, schema.imports.accountId))
      .orderBy(desc(schema.imports.createdAt))
      .limit(10),
  ]);
  const importable = accounts.filter((a) => a.type !== "cash");
  return (
    <div className="max-w-2xl">
      <h1 className="page-title">Import statement</h1>
      <p className="page-sub">
        Upload a bank, credit card or wallet statement. Download it from net banking as CSV or Excel (.xlsx)
        {aiEnabled() ? ", or upload the PDF" : ""}. The file itself is not stored; only the transactions are saved.
      </p>
      {error && <div className="card mb-4 border-bad text-sm text-bad">{error}</div>}
      {importable.length === 0 ? (
        <div className="card text-sm">
          First <Link href="/accounts" className="text-accent underline">add your bank account</Link>, then come back to import.
        </div>
      ) : (
        <form action={importStatement} className="card grid gap-3">
          <Field label="Account">
            <Select name="accountId" required options={importable.map((a) => ({ value: a.id, label: `${a.name}${a.last4 ? ` ••${a.last4}` : ""}` }))} />
          </Field>
          <Field label="Statement file">
            <input type="file" name="file" required accept=".csv,.xlsx,.xls,.pdf,.txt" className="input" />
          </Field>
          <div>
            <SubmitButton pendingText="Reading statement…">Import</SubmitButton>
          </div>
        </form>
      )}
      {recent.length > 0 && (
        <div className="card mt-6">
          <div className="card-title">Recent imports</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Account</th>
                <th>File</th>
                <th className="num">New</th>
                <th className="num">Skipped</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(({ i, account }) => (
                <tr key={i.id}>
                  <td>{i.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</td>
                  <td>{account}</td>
                  <td className="break-all">{i.filename}</td>
                  <td className="num">{i.rowCount}</td>
                  <td className="num">{i.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
