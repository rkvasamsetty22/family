import Link from "next/link";
import { auth, signOut } from "@/auth";
import { pendingCount } from "@/lib/posting";
import { redirect } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/review", label: "Review queue", badge: true },
  { href: "/import", label: "Import statement" },
  { href: "/transactions", label: "Ledger" },
  { href: "/accounts", label: "Accounts" },
  { href: "/loans", label: "Loans" },
  { href: "/dues", label: "Payables & receivables" },
  { href: "/insurance", label: "Insurance" },
  { href: "/reminders", label: "Due dates" },
  { href: "/heads", label: "Heads & rules" },
  { href: "/settings", label: "Settings" },
];

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const pending = await pendingCount();
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-surface md:min-h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <div className="px-4 py-3 text-base font-semibold">Family Finance</div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex shrink-0 items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm text-ink-2 hover:bg-bg hover:text-ink"
            >
              {n.label}
              {n.badge && pending > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-xs font-medium text-white">{pending}</span>
              )}
            </Link>
          ))}
        </nav>
        <form
          className="hidden px-4 py-3 md:block"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <div className="mb-1 truncate text-xs text-ink-3">{session.user.email}</div>
          <button className="text-xs text-ink-2 underline">Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
