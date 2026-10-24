import { moneyShort } from "@/lib/format";

// Horizontal bars as plain HTML so long head names wrap cleanly on phones.
export function HeadBars({ data }: { data: { head: string; total: number }[] }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.head} className="text-xs" title={`${d.head}: ${d.total.toLocaleString("en-IN")}`}>
          <div className="mb-1 flex justify-between gap-2 text-ink-2">
            <span className="truncate">{d.head}</span>
            <span className="tabular-nums text-ink">{moneyShort(d.total)}</span>
          </div>
          <div className="h-2 rounded bg-bg">
            <div className="h-2 rounded" style={{ width: `${Math.max(1, (d.total / max) * 100)}%`, background: "var(--series-1)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
