import Link from "next/link";

export type Tab = { id: string; label: string; count?: number };

// Link-based tabs: the active tab lives in the URL (?tab=...), so pages stay server-rendered
// and a tab can be bookmarked or refreshed. Other query params are kept.
export function Tabs({
  tabs,
  active,
  base,
  params = {},
}: {
  tabs: Tab[];
  active: string;
  base: string;
  params?: Record<string, string | undefined>;
}) {
  return (
    <nav className="tabs no-print" aria-label="Sections">
      {tabs.map((t) => {
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
        q.set("tab", t.id);
        return (
          <Link key={t.id} href={`${base}?${q}`} className="tab" aria-current={t.id === active ? "page" : undefined} scroll={false}>
            {t.label}
            {t.count != null && <span className="tab-count">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function pickTab<T extends string>(value: string | undefined, ids: readonly T[], fallback: T = ids[0]): T {
  return ids.includes(value as T) ? (value as T) : fallback;
}
