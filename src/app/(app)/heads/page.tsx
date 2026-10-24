import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";
import { createHead, createRule, deleteRule, updateHead } from "@/app/actions/masters";
import { listHeads } from "@/lib/queries";
import { HEAD_KIND_LABEL, HEAD_KINDS } from "@/lib/heads";
import { Empty, Field, HeadSelect, Select } from "@/components/fields";

const kindOptions = HEAD_KINDS.map((k) => ({ value: k, label: HEAD_KIND_LABEL[k] }));

export default async function HeadsPage() {
  const [heads, allHeads, rules] = await Promise.all([
    listHeads(),
    db.select().from(schema.heads).orderBy(asc(schema.heads.kind), asc(schema.heads.name)),
    db
      .select({ r: schema.rules, head: schema.heads.name })
      .from(schema.rules)
      .innerJoin(schema.heads, eq(schema.heads.id, schema.rules.headId))
      .orderBy(asc(schema.rules.pattern)),
  ]);
  return (
    <div className="max-w-5xl">
      <h1 className="page-title">Heads & rules</h1>
      <p className="page-sub">
        Heads are your books. Only Income and Expense heads count towards income and expenses; investments, loans and transfers are tracked separately.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="card-title">Rules ({rules.length})</div>
          <p className="mb-3 text-xs text-ink-2">When a statement line contains the text, it is filed under the head automatically.</p>
          {rules.length === 0 ? (
            <Empty>No rules yet. Tick “Always” in the review queue to create them.</Empty>
          ) : (
            <table className="tbl mb-3">
              <thead>
                <tr>
                  <th>Contains</th>
                  <th>Type</th>
                  <th>Head</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map(({ r, head }) => (
                  <tr key={r.id}>
                    <td className="font-mono text-xs">{r.pattern}</td>
                    <td className="text-ink-2">{r.direction === "in" ? "Credit" : r.direction === "out" ? "Debit" : "Both"}</td>
                    <td>{head}</td>
                    <td>
                      <form action={deleteRule}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn-danger">Delete</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form action={createRule} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
            <Field label="Description contains">
              <input name="pattern" required className="input" placeholder="SWIGGY" />
            </Field>
            <Field label="Applies to">
              <Select name="direction" placeholder="Debits and credits" options={[{ value: "out", label: "Debits" }, { value: "in", label: "Credits" }]} />
            </Field>
            <Field label="Head">
              <HeadSelect heads={heads} required />
            </Field>
            <div className="flex items-end">
              <button className="btn">Add rule</button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card-title">Heads</div>
          <form action={createHead} className="mb-3 flex flex-wrap items-end gap-2">
            <Field label="New head">
              <input name="name" required className="input" />
            </Field>
            <Field label="Kind">
              <Select name="kind" options={kindOptions} defaultValue="expense" />
            </Field>
            <button className="btn">Add</button>
          </form>
          <div className="max-h-[32rem] overflow-y-auto">
            {allHeads.map((h) => (
              <form key={h.id} action={updateHead} className="flex items-center gap-2 border-b border-line py-1.5">
                <input type="hidden" name="id" value={h.id} />
                <input name="name" defaultValue={h.name} className="input flex-1" aria-label="Head name" />
                <div className="w-36">
                  <Select name="kind" options={kindOptions} defaultValue={h.kind} />
                </div>
                <label className="flex items-center gap-1 text-xs text-ink-2">
                  <input type="checkbox" name="archived" defaultChecked={h.archived} /> Hide
                </label>
                <button className="btn-ghost text-xs">Save</button>
              </form>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
