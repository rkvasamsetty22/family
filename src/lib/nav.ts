export const APP_NAME = "Family Finance Manager";

export type Tone = "overview" | "money" | "accounts" | "debts" | "cover" | "dates" | "setup";

export type NavItem = { href: string; label: string; badge?: boolean; adminOnly?: boolean };
export type NavGroup = { label: string; tone: Tone; items: NavItem[] };

// Each group gets its own colour tint in the sidebar and on its pages.
export const NAV: NavGroup[] = [
  {
    label: "Overview",
    tone: "overview",
    items: [
      { href: "/", label: "Dashboard" },
      { href: "/reports", label: "Reports" },
    ],
  },
  {
    label: "Money in & out",
    tone: "money",
    items: [
      { href: "/review", label: "Review queue", badge: true },
      { href: "/import", label: "Import statement" },
      { href: "/transactions", label: "Ledger" },
    ],
  },
  { label: "Accounts", tone: "accounts", items: [{ href: "/accounts", label: "Bank & cash" }] },
  {
    label: "Borrowing & dues",
    tone: "debts",
    items: [
      { href: "/loans", label: "Loans" },
      { href: "/dues", label: "Payables & receivables" },
    ],
  },
  { label: "Protection", tone: "cover", items: [{ href: "/insurance", label: "Insurance" }] },
  { label: "Calendar", tone: "dates", items: [{ href: "/reminders", label: "Due dates" }] },
  {
    label: "Setup",
    tone: "setup",
    items: [
      { href: "/heads", label: "Heads & rules" },
      { href: "/settings", label: "Settings" },
      { href: "/users", label: "Family users", adminOnly: true },
    ],
  },
];

const isUnder = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

export function toneFor(path: string): Tone {
  return NAV.find((g) => g.items.some((i) => isUnder(path, i.href)))?.tone ?? "overview";
}

export function isActive(path: string, href: string) {
  return isUnder(path, href);
}
