import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";
import { postAllSuggested, postReviewed } from "@/app/actions/ledger";
import { listAccounts, listActivePolicies, listHeads, listOpenLoans } from "@/lib/queries";
import { guessPattern } from "@/lib/categorize";
import { getSettings } from "@/lib/settings";
import { Amount, Empty, HeadSelect, Select } from "@/components/fields";
import { fmtDate } from "@/lib/format";

const SOURCE_LABEL: Record<string, string> = {
  ai: "AI suggestion",
  transfer: "Looks like a transfer",
  rule: "Rule",
  petty: "Petty",
};

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; skipped?: string; auto?: string }>;
}) {
  const sp = await searchParams;
  const [pending, heads, accounts, loans, policies, settings] = await Promise.all([
    db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.status, "pending"))
      .orderBy(asc(schema.transactions.date), asc(schema.transactions.id))
      .limit(100),
    listHeads(),
    listAccounts(),
    listOpenLoans(),
    listActivePolicies(),
    getSettings(),
  ]);
  const acct = new Map(accounts.map((a) => [a.id, a.name]));
  const members = settings.members.split(",").map((m) => m.trim()).filter(Boolean);
  const withSuggestion = pending.filter((p) => p.headId).length;

  return (
    <div className="max-w-5xl">
      <h1 className="page-title">Review queue</h1>
      <p className="page-sub">
        Pick the head for each new transaction. Tick <em>Always</em> to save a rule so similar lines are filed automatically next time.
      </p>
      {sp.added && (
        <div className="card mb-4 text-sm">
          Imported {sp.added} new transactions ({sp.auto} filed automatically by rules or as petty expenses).
          {Number(sp.skipped) > 0 && ` Skipped ${sp.skipped} already imported.`}
        </div>
      )}
      {pending.length === 0 ? (
        <div className="card">
          <Empty>Nothing to review. Import a statement to get started.</Empty>
        </div>
      ) : (
        <>
          {withSuggestion > 0 && (
            <form action={postAllSuggested} className="mb-3">
              <button className="btn-ghost">Accept all {withSuggestion} suggestions</button>
            </form>
          )}
          <div className="space-y-2">
            {pending.map((t) => (
              <form key={t.id} action={postReviewed} className="card">
                <input type="hidden" name="id" value={t.id} />
                <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4">
                  <div className="min-w-0">
                    <div className="text-xs text-ink-3">
                      {fmtDate(t.date)} · {acct.get(t.accountId)}
                      {t.suggestedBy && <span className="ml-2 rounded bg-bg px-1.5 py-0.5">{SOURCE_LABEL[t.suggestedBy] ?? t.suggestedBy}</span>}
                    </div>
                    <div className="break-words text-sm">{t.description}</div>
                  </div>
                  <div className="text-base font-semibold">
                    <Amount value={t.amount} direction={t.direction} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-full sm:w-60">
                    <HeadSelect heads={heads} defaultValue={t.headId} required direction={t.direction} />
                  </div>
                  {loans.length > 0 && (
                    <div className="w-[calc(50%-0.25rem)] sm:w-40">
                      <Select name="loanId" placeholder="No loan" options={loans.map((l) => ({ value: l.id, label: l.party }))} defaultValue={t.loanId} />
                    </div>
                  )}
                  {policies.length > 0 && (
                    <div className="w-[calc(50%-0.25rem)] sm:w-40">
                      <Select
                        name="policyId"
                        placeholder="No policy"
                        options={policies.map((p) => ({ value: p.id, label: `${p.insurer} ${p.planName ?? p.type}` }))}
                        defaultValue={t.policyId}
                      />
                    </div>
                  )}
                  {members.length > 0 && (
                    <div className="w-[calc(50%-0.25rem)] sm:w-32">
                      <Select name="member" placeholder="Member" options={members.map((m) => ({ value: m, label: m }))} defaultValue={t.member} />
                    </div>
                  )}
                  <label className="flex items-center gap-1.5 text-xs text-ink-2" title="Save a rule so future lines containing this text are filed automatically">
                    <input type="checkbox" name="saveRule" />
                    Always file lines containing
                    <input name="pattern" defaultValue={guessPattern(t.description)} className="input w-36 text-xs" aria-label="Rule pattern" />
                  </label>
                  <button className="btn ml-auto">Post</button>
                </div>
              </form>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
