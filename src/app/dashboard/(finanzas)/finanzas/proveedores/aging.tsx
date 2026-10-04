import Link from "next/link";
import { fmtMoney } from "@/lib/finance/entities";
import { AGING_BUCKETS, type AgingKey, type payablesAging } from "@/lib/finance/suppliers";

// Age of what is owed: one hue, light → dark as it gets older (not identity).
export const AGING_COLORS: Record<AgingKey, string> = {
  current: "#0f9f8f",
  d30: "#f3c27c",
  d60: "#e9a04a",
  d90: "#d97e0a",
  older: "#9a5a06",
};

type Aging = Awaited<ReturnType<typeof payablesAging>>;

/** Stacked bar + legend of the A/P aging; each bucket opens the unpaid list. */
export function AgingBar({ aging, href }: { aging: Aging; href: (bucket: AgingKey | null) => string }) {
  if (aging.total === 0) return <p className="text-sm text-muted-foreground">No se le debe nada a ningún proveedor.</p>;
  return (
    <div className="space-y-3">
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full bg-stone-100">
        {AGING_BUCKETS.map((b) =>
          aging.totals[b.key] ? (
            <Link
              key={b.key}
              href={href(b.key)}
              title={`${b.label}: ${fmtMoney(aging.totals[b.key])}`}
              className="h-full transition hover:opacity-80"
              style={{ width: `${(aging.totals[b.key] / aging.total) * 100}%`, backgroundColor: AGING_COLORS[b.key] }}
            />
          ) : null,
        )}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-5">
        {AGING_BUCKETS.map((b) => (
          <li key={b.key}>
            <Link href={href(b.key)} className="group block">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-foreground">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: AGING_COLORS[b.key] }} />
                {b.label}
              </span>
              <span className="font-medium tabular-nums">{fmtMoney(aging.totals[b.key])}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** QuickBooks-style A/P aging summary: one row per supplier. */
export function AgingTable({ aging, supplierHref }: { aging: Aging; supplierHref: (id: string) => string }) {
  if (aging.suppliers.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Proveedor</th>
            {AGING_BUCKETS.map((b) => (
              <th key={b.key} className="py-2 px-2 text-right font-medium">{b.label}</th>
            ))}
            <th className="py-2 pl-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {aging.suppliers.map((s) => (
            <tr key={s.supplierId ?? s.name} className="border-b last:border-0 hover:bg-stone-50">
              <td className="py-2 pr-3">
                {s.supplierId ? <Link href={supplierHref(s.supplierId)} className="font-medium hover:underline">{s.name}</Link> : s.name}
              </td>
              {AGING_BUCKETS.map((b) => (
                <td key={b.key} className={`py-2 px-2 text-right tabular-nums ${s[b.key] ? (b.key === "current" ? "" : "text-amber-800") : "text-muted-foreground"}`}>
                  {s[b.key] ? fmtMoney(s[b.key], { decimals: true }) : "—"}
                </td>
              ))}
              <td className="py-2 pl-2 text-right font-medium tabular-nums">{fmtMoney(s.total, { decimals: true })}</td>
            </tr>
          ))}
          <tr className="border-t-2 font-semibold">
            <td className="py-2 pr-3">Total</td>
            {AGING_BUCKETS.map((b) => (
              <td key={b.key} className="py-2 px-2 text-right tabular-nums">{fmtMoney(aging.totals[b.key], { decimals: true })}</td>
            ))}
            <td className="py-2 pl-2 text-right tabular-nums">{fmtMoney(aging.total, { decimals: true })}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
