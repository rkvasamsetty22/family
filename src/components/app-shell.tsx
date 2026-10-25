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
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:gap-4 md:overflow-visible" aria-label="Main">
          {groups.map((g) => (
            <div key={g.label} data-tone={g.tone} className="flex shrink-0 gap-1 md:flex-col md:gap-1">
              <div className="hidden items-center gap-2 px-2.5 text-xs font-bold uppercase tracking-wide text-tint-fg md:flex">
                <span className="h-2 w-2 rounded-full bg-tint" />
                {g.label}
              </div>
              {/* Pages sit indented under their heading, on a tinted guide line. */}
              <ul className="nav-sub flex gap-1 md:ml-[13px] md:flex-col md:gap-0.5 md:border-l-2 md:pl-2.5">
                {g.items.map((n) => {
                  const active = isActive(path, n.href);
                  return (
                    <li key={n.href} className="shrink-0">
                      <Link
                        href={n.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                          active ? "soft font-semibold text-tint-fg" : "text-ink-2 hover:bg-bg hover:text-ink"
                        }`}
                      >
                        {n.label}
                        {n.badge && pending > 0 && <span className="rounded-full bg-tint px-1.5 text-xs font-medium text-white">{pending}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
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
