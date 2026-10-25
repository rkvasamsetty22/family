import { PERIODS, REPORTS, REPORT_IDS, buildReport, resolvePeriod, type Section } from "@/lib/reports";

export const metadata = { title: "Reports" };
import { Tabs, pickTab } from "@/components/tabs";
import { PrintButton } from "@/components/print-button";
import { Empty, Field } from "@/components/fields";
import { money } from "@/lib/format";
import { APP_NAME } from "@/lib/nav";

const SCREEN_ROWS = 500;

function SectionTable({ s }: { s: Section }) {
  const shown = s.rows.slice(0, SCREEN_ROWS);
  const fmt = (v: unknown, i: number) => (v == null ? "" : typeof v === "number" && s.columns[i].money ? money(v, true) : String(v));
  const right = (i: number) => s.columns[i].money || s.columns[i].align === "right";
  return (
    <div className="card mb-4">
      <div className="card-title">{s.title}</div>
      {s.rows.length === 0 ? (
        <Empty>{s.empty ?? "Nothing to show."}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className={`tbl ${s.columns.length > 5 ? "min-w-[720px]" : ""}`}>
            <thead>
              <tr>
                {s.columns.map((c, i) => (
                  <th key={i} className={right(i) ? "num" : ""}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, r) => (
                <tr key={r} data-kind={s.kinds?.[r] ?? undefined} className={s.kinds?.[r] ? "kind-row" : ""}>
                  {row.map((v, i) => (
                    <td key={i} className={`${right(i) ? "num" : ""} ${typeof v === "number" && v < 0 ? "text-bad" : ""}`}>{fmt(v, i)}</td>
                  ))}
                </tr>
              ))}
              {s.total && (
                <tr className="total">
                  {s.total.map((v, i) => (
                    <td key={i} className={right(i) ? "num" : ""}>{fmt(v, i)}</td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
          {s.rows.length > SCREEN_ROWS && (
            <p className="no-print mt-2 text-xs text-ink-3">
              Showing the first {SCREEN_ROWS} of {s.rows.length} rows. Download the report to get all of them.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const tab = pickTab(sp.tab, REPORT_IDS);
  const period = resolvePeriod(sp);
  const report = await buildReport(tab, period);
  const keep = { period: period.id, ...(period.id === "custom" ? { from: period.from, to: period.to } : {}) };
  const qs = (format: string) => new URLSearchParams({ ...keep, format }).toString();
  const generated = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="max-w-6xl">
      <div className="print-only mb-4 border-b border-line pb-2">
        <div className="text-lg font-semibold">{APP_NAME}</div>
        <div className="text-sm">{report.title} · {report.period}</div>
        <div className="text-xs text-ink-3">Generated {generated} · private and confidential</div>
      </div>

      <div className="no-print">
        <h1 className="page-title">Reports</h1>
        <p className="page-sub">Statements for any period. Print them, or download as PDF, Excel or CSV.</p>

        <form className="card mb-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value={tab} />
          <Field label="Period">
            <select name="period" defaultValue={period.id} className="input">
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </Field>
          <Field label="From (custom)">
            <input type="date" name="from" defaultValue={period.from} className="input" />
          </Field>
          <Field label="To (custom)">
            <input type="date" name="to" defaultValue={period.to} className="input" />
          </Field>
          <button className="btn">Show</button>
          <div className="ml-auto text-sm text-ink-2">{period.label}</div>
        </form>

        <Tabs tabs={REPORTS.map((r) => ({ id: r.id, label: r.label }))} active={tab} base="/reports" params={keep} />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <PrintButton />
          <a className="btn-ghost" href={`/api/reports/${tab}?${qs("pdf")}`} download>Download PDF</a>
          <a className="btn-ghost" href={`/api/reports/${tab}?${qs("xlsx")}`} download>Excel</a>
          <a className="btn-ghost" href={`/api/reports/${tab}?${qs("csv")}`} download>CSV</a>
          <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" />
          <a className="btn" href={`/api/reports/all?${qs("pdf")}`} download>Full report pack (PDF)</a>
          <a className="btn-ghost" href={`/api/reports/all?${qs("xlsx")}`} download>Full pack (Excel)</a>
        </div>
        {tab === "position" && <p className="mb-3 text-xs text-ink-3">Balances and obligations are as of today, whatever period is chosen.</p>}
      </div>

      {report.sections.map((s) => (
        <SectionTable key={s.title} s={s} />
      ))}
    </div>
  );
}
