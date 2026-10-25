import Link from "next/link";
import { REMINDER_KIND, upcomingReminders } from "@/lib/queries";
import { Empty } from "@/components/fields";
import { fmtDate, money } from "@/lib/format";
import { daysBetween, todayIST } from "@/lib/dates";

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days } = await searchParams;
  const window = [30, 90, 365].includes(Number(days)) ? Number(days) : 30;
  const today = todayIST();
  const items = await upcomingReminders(window, today);
  return (
    <div className="max-w-4xl">
      <h1 className="page-title">Due dates</h1>
      <p className="page-sub">EMIs, premiums, payables, receivables and maturities, from loans, policies and dues.</p>
      <nav className="tabs" aria-label="Window">
        {[30, 90, 365].map((d) => (
          <Link key={d} href={`/reminders?days=${d}`} className="tab" aria-current={d === window ? "page" : undefined}>
            Next {d} days
          </Link>
        ))}
      </nav>
      <div className="card overflow-x-auto">
        {items.length === 0 ? (
          <Empty>Nothing due in the next {window} days.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>In</th>
                <th>Type</th>
                <th>What</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => {
                const d = daysBetween(today, r.date);
                return (
                  <tr key={i} data-kind={REMINDER_KIND[r.kind]} className="kind-row">
                    <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className={`whitespace-nowrap ${d < 0 ? "font-medium text-bad" : d <= 7 ? "text-warn" : "text-ink-2"}`}>
                      {d < 0 ? `${-d} days overdue` : d === 0 ? "Today" : `${d} days`}
                    </td>
                    <td>
                      <span data-kind={REMINDER_KIND[r.kind]} className="kind-chip">{r.kind}</span>
                    </td>
                    <td>
                      <Link href={r.href} className="hover:underline">{r.title}</Link>
                    </td>
                    <td className="num">{r.amount ? money(r.amount) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
