// Dates are handled as ISO yyyy-mm-dd strings in IST to avoid timezone drift.

export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

// Indian financial year: April to March.
export function fyRange(iso: string = todayIST()): { start: string; end: string; label: string } {
  const [y, m] = iso.split("-").map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
    label: `FY ${startYear}-${String(startYear + 1).slice(2)}`,
  };
}

export function monthStart(iso: string = todayIST()) {
  return iso.slice(0, 8) + "01";
}

export const FREQ_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

// Next date on or after `from` for an EMI that falls on day `emiDay` each month.
export function nextEmiDate(emiDay: number, from: string = todayIST()): string {
  const [y, m, d] = from.split("-").map(Number);
  const clamp = (yy: number, mm: number) => {
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(emiDay, last)).padStart(2, "0")}`;
  };
  if (d <= emiDay) return clamp(y, m);
  return m === 12 ? clamp(y + 1, 1) : clamp(y, m + 1);
}
