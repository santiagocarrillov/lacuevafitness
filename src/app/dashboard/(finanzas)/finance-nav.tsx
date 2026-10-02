"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Item = { label: string; path: string; tab?: string };

const ITEMS: Item[] = [
  { label: "Resumen", path: "/dashboard/finanzas", tab: "resumen" },
  { label: "Facturación", path: "/dashboard/facturas" },
  { label: "Gastos", path: "/dashboard/gastos" },
  { label: "Banco", path: "/dashboard/finanzas", tab: "banco" },
  { label: "Impuestos", path: "/dashboard/finanzas", tab: "impuestos" },
  { label: "Aportes y préstamos", path: "/dashboard/finanzas", tab: "aportes" },
  { label: "Otros ingresos", path: "/dashboard/finanzas", tab: "otros" },
  { label: "Contabilidad", path: "/dashboard/contabilidad" },
];

/** Second-level navigation of the Finanzas menu. Keeps the selected month. */
export function FinanceNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const mes = params.get("mes");
  const tab = params.get("tab") ?? "resumen";
  const isActive = (i: Item) =>
    i.tab ? pathname === i.path && tab === i.tab : pathname === i.path || pathname.startsWith(`${i.path}/`);
  const href = (i: Item) => {
    const q = new URLSearchParams();
    if (i.tab && i.tab !== "resumen") q.set("tab", i.tab);
    if (mes) q.set("mes", mes);
    const s = q.toString();
    return s ? `${i.path}?${s}` : i.path;
  };
  return (
    <nav aria-label="Finanzas" className="sticky top-12 z-20 border-b bg-background/95 backdrop-blur md:top-11">
      <div className="flex gap-1 overflow-x-auto px-4 md:px-8">
        {ITEMS.map((i) => (
          <Link
            key={i.label}
            href={href(i)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              isActive(i) ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
