import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ENTITIES, ENTITY_ORDER, monthLabel, shiftMonth } from "@/lib/finance/entities";
import type { EntityView } from "@/lib/finance/home";

/** Title row shared by the accounting screens: title, a line of context and controls. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </header>
  );
}

/** ← month → (the future is disabled). `href` builds the URL for another month. */
export function MonthNav({ ym, thisMonth, href }: { ym: string; thisMonth: string; href: (ym: string) => string }) {
  const atEnd = ym >= thisMonth;
  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="Mes">
      <Link href={href(shiftMonth(ym, -1))} className="rounded-md border p-1.5 hover:bg-muted" aria-label="Mes anterior">
        <ChevronLeft className="size-4" />
      </Link>
      <span className="inline-block min-w-32 text-center font-medium first-letter:uppercase">{monthLabel(ym)}</span>
      <Link
        href={href(shiftMonth(ym, 1))}
        aria-disabled={atEnd}
        aria-label="Mes siguiente"
        className={`rounded-md border p-1.5 hover:bg-muted ${atEnd ? "pointer-events-none opacity-40" : ""}`}
      >
        <ChevronRight className="size-4" />
      </Link>
      {ym !== thisMonth && (
        <Link href={href(thisMonth)} className="ml-1 text-xs text-primary hover:underline">
          Hoy
        </Link>
      )}
    </nav>
  );
}

/** Consolidado · one pill per legal entity. */
export function EntityPills({ view, href, consolidated = true }: { view: EntityView; href: (v: EntityView) => string; consolidated?: boolean }) {
  const options: EntityView[] = consolidated ? ["ALL", ...ENTITY_ORDER] : ENTITY_ORDER;
  return (
    <div className="flex rounded-full border bg-muted/40 p-0.5 text-xs" role="tablist" aria-label="Empresa">
      {options.map((v) => (
        <Link
          key={v}
          href={href(v)}
          role="tab"
          aria-selected={v === view}
          className={`rounded-full px-3 py-1 font-medium transition ${v === view ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {v === "ALL" ? "Consolidado" : ENTITIES[v].name.replace("La Cueva ", "")}
        </Link>
      ))}
    </div>
  );
}
