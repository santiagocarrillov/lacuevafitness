import Link from "next/link";
import type { ReactNode } from "react";

// Building blocks for list pages (Leads, Socios), after Gambit's contacts list:
// title + record count, saved-view tabs, a clickable summary strip, and a white
// table with small uppercase headers on the warm background.

export function ListHeader({ title, count, noun, children }: { title: string; count: number; noun: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-2 pt-5 md:px-6">
      <div>
        <h1 className="text-3xl font-semibold leading-none tracking-tight">{title}</h1>
        <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {count.toLocaleString("es-EC")} {noun}
        </p>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export type ViewTab = { label: string; href: string; active: boolean };

export function ViewTabs({ tabs }: { tabs: ViewTab[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border px-4 md:px-6">
      {tabs.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          scroll={false}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition ${
            t.active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export type SummaryItem = { label: string; value: ReactNode; hint?: ReactNode; href?: string; active?: boolean };

export function SummaryStrip({ items }: { items: SummaryItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-3 md:px-6 lg:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      {items.map((it) => {
        const body = (
          <>
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{it.label}</div>
            <div className="mt-1.5 text-2xl font-semibold leading-none tabular-nums">{it.value}</div>
            {it.hint && <div className="mt-1 text-xs text-muted-foreground">{it.hint}</div>}
          </>
        );
        const cls = `block rounded-lg border bg-card p-4 shadow-sm ${it.active ? "border-primary ring-1 ring-primary" : "border-border"}`;
        return it.href ? (
          <Link key={it.label} href={it.href} scroll={false} className={`${cls} transition hover:border-foreground/30`}>
            {body}
          </Link>
        ) : (
          <div key={it.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** Table wrapper: white, full width, horizontal scroll inside on small screens. */
export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto bg-card">
      <table className="w-full min-w-[860px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export const th =
  "whitespace-nowrap border-b border-border bg-card px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground first:pl-4 md:first:pl-6";
export const td = "border-b border-border px-4 py-3 align-middle first:pl-4 md:first:pl-6";

export function PersonCell({ href, name, sub }: { href: string; name: string; sub?: string | null }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <Link href={href} className="group flex items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
        {initials || "?"}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium group-hover:underline">{name}</span>
        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
    </Link>
  );
}

/** "hace 3 d" for the last-activity column. */
export function relativeDays(d: Date | null | undefined): string {
  if (!d) return "--";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} d`;
  const months = Math.floor(days / 30);
  return months < 12 ? `hace ${months} m` : `hace ${Math.floor(months / 12)} a`;
}
