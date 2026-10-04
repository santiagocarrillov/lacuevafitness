import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { fmtMoney } from "@/lib/finance/entities";

/** White card with a small-caps title, like QuickBooks Online's dashboard tiles. */
export function Panel({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-600">{title}</h2>
        {aside && <div className="text-xs text-muted-foreground">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** Headline number with its label; the whole tile opens its detail. */
export function Stat({ label, value, sub, href, icon: Icon, color }: { label: string; value: string; sub?: ReactNode; href?: string; icon: LucideIcon; color: string }) {
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}14`, color }}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </>
  );
  const cls = "flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]";
  return href ? (
    <Link href={href} className={`${cls} transition hover:border-stone-400`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Ranked horizontal bars (one hue: magnitude, not identity). */
export function BarList({ rows, color, empty }: { rows: { label: string; cents: number; href?: string; note?: string }[]; color: string; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.cents), 1);
  const total = rows.reduce((a, r) => a + r.cents, 0);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-foreground/80 group-hover:text-foreground">
                {r.label}
                {r.note && <span className="text-xs text-muted-foreground"> · {r.note}</span>}
              </span>
              <span className="shrink-0 tabular-nums font-medium">
                {fmtMoney(r.cents)}
                <span className="ml-1.5 inline-block w-9 text-right text-xs font-normal text-muted-foreground">
                  {total ? Math.round((r.cents / total) * 100) : 0}%
                </span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full" style={{ width: `${(r.cents / max) * 100}%`, backgroundColor: color }} />
            </div>
          </>
        );
        return (
          <li key={r.label}>
            {r.href ? (
              <Link href={r.href} className="group block">
                {inner}
              </Link>
            ) : (
              <div className="group">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Soon({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500">{children}</span>;
}
