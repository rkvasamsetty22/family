"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, NAV, isActive, toneFor } from "@/lib/nav";

export function AppShell({
  isAdmin,
  pending,
  footer,
  children,
}: {
  isAdmin: boolean;
  pending: number;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || isAdmin) })).filter((g) => g.items.length);
  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
        <Link href="/" className="flex items-center gap-2 px-4 py-3.5" data-tone="overview">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-tint text-sm font-bold text-white" aria-hidden>₹</span>
          <span className="text-sm font-semibold leading-tight">{APP_NAME}</span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:gap-3 md:overflow-visible" aria-label="Main">
          {groups.map((g) => (
            <div key={g.label} data-tone={g.tone} className="flex shrink-0 gap-1 md:flex-col md:gap-0.5">
              <div className="hidden items-center gap-1.5 px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-tint-fg md:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-tint" />
                {g.label}
              </div>
              {g.items.map((n) => {
                const active = isActive(path, n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex shrink-0 items-center justify-between gap-2 rounded-lg border-l-[3px] px-2.5 py-1.5 text-sm ${
                      active ? "soft border-tint font-medium text-tint-fg" : "border-transparent text-ink-2 hover:bg-bg hover:text-ink"
                    }`}
                  >
                    {n.label}
                    {n.badge && pending > 0 && <span className="rounded-full bg-tint px-1.5 text-xs font-medium text-white">{pending}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {footer}
      </aside>
      <main data-tone={toneFor(path)} className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
