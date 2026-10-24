"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const short = (n: number) => (Math.abs(n) >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr` : Math.abs(n) >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
const monthLabel = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });

const axis = { stroke: "var(--text-3)", fontSize: 12, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 12 },
  labelStyle: { color: "var(--text-2)" },
  cursor: { fill: "var(--border)", opacity: 0.4 },
};

export function IncomeExpenseChart({ data }: { data: { month: string; income: number; expense: number }[] }) {
  return (
    <>
      <div className="mb-2 flex gap-4 text-xs text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--series-1)" }} />Income</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--series-2)" }} />Expenses</span>
      </div>
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
        <YAxis tickFormatter={short} width={44} {...axis} />
        <Tooltip formatter={(v) => inr(Number(v))} labelFormatter={(m) => monthLabel(String(m))} {...tooltipStyle} />
        <Bar dataKey="income" name="Income" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="expense" name="Expenses" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
    </>
  );
}
