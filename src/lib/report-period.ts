import { addMonths, fyRange, todayIST } from "./dates";
import { fmtDate } from "./format";

// Report shapes and period handling, kept free of database imports so exports and tests can use them.

export const REPORTS = [
  { id: "summary", label: "Income & expenses" },
  { id: "monthly", label: "Month by month" },
  { id: "heads", label: "By head" },
  { id: "transactions", label: "Transactions" },
  { id: "position", label: "Balances & obligations" },
] as const;
export type ReportId = (typeof REPORTS)[number]["id"];
export const REPORT_IDS = REPORTS.map((r) => r.id) as ReportId[];

export type Column = { label: string; money?: boolean; align?: "right" };
export type Cell = string | number | null;
export type Section = {
  title: string;
  columns: Column[];
  rows: Cell[][];
  total?: Cell[];
  // Head kind (or in/out) per row, used to tint rows on screen.
  kinds?: (string | null)[];
  empty?: string;
};
export type Report = { id: ReportId | "all"; title: string; period: string; sections: Section[] };

// ---------- Period ----------

export const PERIODS = [
  { id: "fy", label: "This FY" },
  { id: "lastfy", label: "Last FY" },
  { id: "month", label: "This month" },
  { id: "lastmonth", label: "Last month" },
  { id: "custom", label: "Custom" },
] as const;
export type PeriodId = (typeof PERIODS)[number]["id"];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validIso = (s: string | undefined): s is string => !!s && ISO.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
const monthEnd = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return `${iso.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

export type Period = { id: PeriodId; from: string; to: string; label: string };

export function resolvePeriod(p: { period?: string; from?: string; to?: string }, today = todayIST()): Period {
  const fy = fyRange(today);
  const mStart = today.slice(0, 8) + "01";
  switch (p.period) {
    case "lastfy": {
      const last = fyRange(addMonths(fy.start, -1));
      return { id: "lastfy", from: last.start, to: last.end, label: last.label };
    }
    case "month":
      return { id: "month", from: mStart, to: monthEnd(mStart), label: monthLabel(mStart) };
    case "lastmonth": {
      const s = addMonths(mStart, -1);
      return { id: "lastmonth", from: s, to: monthEnd(s), label: monthLabel(s) };
    }
    case "custom": {
      if (validIso(p.from) && validIso(p.to) && p.from <= p.to && p.from >= "1990-01-01" && p.to <= "2100-12-31")
        return { id: "custom", from: p.from, to: p.to, label: `${fmtDate(p.from)} to ${fmtDate(p.to)}` };
      break;
    }
  }
  return { id: "fy", from: fy.start, to: fy.end, label: `${fy.label} (April to March)` };
}

export function monthLabel(iso: string) {
  return new Date(iso.slice(0, 7) + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}
