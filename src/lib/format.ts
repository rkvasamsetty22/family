const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const inrExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});

export const toNum = (v: string | number | null | undefined) => (v == null ? 0 : Number(v));

export function money(v: string | number | null | undefined, exact = false) {
  return (exact ? inrExact : inr).format(toNum(v));
}

// Lakh/crore shorthand for tiles: ₹12.5 L, ₹1.2 Cr
export function moneyShort(v: string | number | null | undefined) {
  const n = toNum(v);
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return money(n);
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
