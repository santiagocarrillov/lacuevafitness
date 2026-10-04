import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, HandCoins, Plus, Receipt, Search, Truck } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { ENTITIES, ENTITY_ORDER, EXPENSE_CATEGORY_LABELS, fmtMoney } from "@/lib/finance/entities";
import { parseEntityView, type EntityView } from "@/lib/finance/home";
import { payablesAging, supplierStats } from "@/lib/finance/suppliers";
import { SEARCH_SOURCES, idsMatching } from "@/lib/text-search";
import { ecuadorDateString } from "@/lib/timezone";
import { EntityPills, PageHeader } from "../../page-header";
import { BarList, Panel, Stat } from "../../blocks";
import { AgingBar } from "./aging";

export const dynamic = "force-dynamic";

const ORANGE = "#d97e0a";

export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<{ anio?: string; entidad?: string; q?: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const params = await searchParams;
  const today = ecuadorDateString();
  const thisYear = Number(today.slice(0, 4));
  const year = /^\d{4}$/.test(params.anio ?? "") && Number(params.anio) <= thisYear ? Number(params.anio) : thisYear;
  const view = parseEntityView(params.entidad);
  const sedes = view === "ALL" ? ENTITY_ORDER : [view];
  const q = (params.q ?? "").trim();
  const href = (u: { anio?: number; entidad?: EntityView; q?: string }) => {
    const p = new URLSearchParams({ anio: String(u.anio ?? year) });
    const e = u.entidad ?? view;
    if (e !== "ALL") p.set("entidad", e);
    const qq = u.q ?? q;
    if (qq) p.set("q", qq);
    return `/dashboard/finanzas/proveedores?${p}`;
  };

  const ids = q ? await idsMatching(SEARCH_SOURCES.supplier, q) : null;
  const [suppliers, aging] = await Promise.all([
    supplierStats({ sedes, year, today, ids }),
    payablesAging({ sede: { in: sedes }, isPrivate: false }, today),
  ]);
  const yearCents = suppliers.reduce((a, s) => a + s.yearCents, 0);
  const withRuc = suppliers.filter((s) => s.taxId).length;
  const porPagar = (bucket?: string | null) => `/dashboard/gastos?ver=porpagar${view !== "ALL" ? `&entidad=${view}` : ""}${bucket ? `&antiguedad=${bucket}` : ""}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Proveedores" subtitle={`A quién le compra la empresa, cuánto en ${year} y qué se le debe. Cada gasto agrega su proveedor solo; sueldos y coaches están en Trabajadores.`}>
        <EntityPills view={view} href={(v) => href({ entidad: v })} />
        <nav className="flex items-center gap-1 text-sm" aria-label="Año">
          {[thisYear - 1, thisYear].map((y) => (
            <Link key={y} href={href({ anio: y })} className={`rounded-md border px-2.5 py-1 ${y === year ? "border-foreground font-medium" : "text-muted-foreground hover:bg-muted"}`}>
              {y}
            </Link>
          ))}
        </nav>
        <Link href="/dashboard/finanzas/proveedores/nuevo" className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: ORANGE }}>
          <Plus className="size-4" /> Proveedor
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Compras ${year}`} value={fmtMoney(yearCents)} sub={`${suppliers.filter((s) => s.yearCents).length} proveedores con compras`} href="/dashboard/gastos?rango=anio" icon={Receipt} color={ORANGE} />
        <Stat label="Por pagar" value={fmtMoney(aging.total)} sub={`${aging.count} documentos`} href={porPagar()} icon={HandCoins} color="#2f6fb0" />
        <Stat
          label="Vencido"
          value={fmtMoney(aging.total - aging.totals.current)}
          sub={aging.overdueCount ? `${aging.overdueCount} documentos vencidos` : "Nada vencido"}
          href={porPagar("vencido")}
          icon={CalendarClock}
          color={aging.overdueCount ? "#e5533f" : "#0f9f8f"}
        />
        <Stat label="Con RUC" value={`${withRuc} de ${suppliers.length}`} sub="Los demás: tiendas sin factura" icon={Truck} color="#6b4fb5" />
      </div>

      <Panel title="Antigüedad de lo que se debe" aside={<Link href={porPagar()} className="text-[#2f6fb0] hover:underline">Ver cuentas por pagar ›</Link>}>
        <AgingBar aging={aging} href={(b) => porPagar(b)} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] lg:col-span-2">
          <form className="flex items-center gap-2 border-b px-4 py-2.5" action="/dashboard/finanzas/proveedores">
            <Search className="size-4 text-muted-foreground" />
            <input type="hidden" name="anio" value={year} />
            {view !== "ALL" && <input type="hidden" name="entidad" value={view} />}
            <input name="q" defaultValue={q} placeholder="Buscar por nombre, RUC o contacto…" className="h-8 flex-1 bg-transparent text-sm outline-none" />
          </form>
          {suppliers.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {q ? "Ningún proveedor coincide." : "Todavía no hay proveedores. Se agregan solos al registrar gastos o al importar las facturas del SRI."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-stone-50/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Proveedor</th>
                    <th className="hidden px-3 py-2.5 font-medium md:table-cell">Rubro</th>
                    <th className="px-3 py-2.5 text-right font-medium">Compras {year}</th>
                    <th className="px-4 py-2.5 text-right font-medium">Por pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-stone-50">
                      <td className="px-4 py-2.5">
                        <Link href={`/dashboard/finanzas/proveedores/${s.id}`} className="font-medium hover:underline">{s.tradeName ?? s.name}</Link>
                        <p className="text-xs text-muted-foreground">
                          {s.taxId ? `RUC ${s.taxId}` : "Sin RUC"}
                          {view === "ALL" && s.sedes.length > 0 && ` · ${s.sedes.map((x) => ENTITIES[x].name.replace("La Cueva ", "")).join(", ")}`}
                        </p>
                      </td>
                      <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{s.topCategory ? EXPENSE_CATEGORY_LABELS[s.topCategory] : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.yearCents ? fmtMoney(s.yearCents) : "—"}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${s.overdueCents ? "font-medium text-red-700" : s.payableCents ? "text-amber-700" : "text-muted-foreground"}`}>
                        {s.payableCents ? fmtMoney(s.payableCents) : "—"}
                        {s.overdueCents > 0 && <span className="block text-[11px]">vencido {fmtMoney(s.overdueCents)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <Panel title={`Principales proveedores ${year}`}>
          <BarList
            rows={suppliers.filter((s) => s.yearCents).slice(0, 8).map((s) => ({ label: s.tradeName ?? s.name, cents: s.yearCents, href: `/dashboard/finanzas/proveedores/${s.id}` }))}
            color={ORANGE}
            empty="Sin compras este año."
          />
        </Panel>
      </div>
    </div>
  );
}
