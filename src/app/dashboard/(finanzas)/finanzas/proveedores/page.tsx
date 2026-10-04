import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, HandCoins, Receipt, Truck } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENTITIES, ENTITY_ORDER, EXPENSE_CATEGORY_LABELS, fmtMoney } from "@/lib/finance/entities";
import { parseEntityView, type EntityView } from "@/lib/finance/home";
import { listSuppliers } from "@/lib/finance/suppliers";
import { ecuadorDateString } from "@/lib/timezone";
import { EntityPills, PageHeader } from "../../page-header";
import { BarList, Panel, Stat } from "../../blocks";

export const dynamic = "force-dynamic";

const ORANGE = "#d97e0a";

export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<{ anio?: string; entidad?: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const params = await searchParams;
  const today = ecuadorDateString();
  const thisYear = Number(today.slice(0, 4));
  const year = /^\d{4}$/.test(params.anio ?? "") && Number(params.anio) <= thisYear ? Number(params.anio) : thisYear;
  const view = parseEntityView(params.entidad);
  const sedes = view === "ALL" ? ENTITY_ORDER : [view];
  const href = (u: { anio?: number; entidad?: EntityView }) => {
    const q = new URLSearchParams({ anio: String(u.anio ?? year) });
    const e = u.entidad ?? view;
    if (e !== "ALL") q.set("entidad", e);
    return `/dashboard/finanzas/proveedores?${q}`;
  };

  const [suppliers, payables] = await Promise.all([
    listSuppliers(sedes, year),
    prisma.expense.findMany({
      where: { sede: { in: sedes }, voidedAt: null, status: "PENDING" },
      select: { amountCents: true, dueDate: true },
    }),
  ]);
  const yearCents = suppliers.reduce((a, s) => a + s.yearCents, 0);
  const payableCents = payables.reduce((a, p) => a + p.amountCents, 0);
  const overdue = payables.filter((p) => p.dueDate && p.dueDate.toISOString().slice(0, 10) < today);
  const withRuc = suppliers.filter((s) => s.ruc).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Proveedores" subtitle={`A quién le compra la empresa, cuánto en ${year} y qué se le debe. Sueldos y honorarios de coaches están en Trabajadores.`}>
        <EntityPills view={view} href={(v) => href({ entidad: v })} />
        <nav className="flex items-center gap-1 text-sm" aria-label="Año">
          {[thisYear - 1, thisYear].map((y) => (
            <Link key={y} href={href({ anio: y })} className={`rounded-md border px-2.5 py-1 ${y === year ? "border-foreground font-medium" : "text-muted-foreground hover:bg-muted"}`}>
              {y}
            </Link>
          ))}
        </nav>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Compras ${year}`} value={fmtMoney(yearCents)} sub={`${suppliers.length} proveedores`} href={`/dashboard/gastos`} icon={Receipt} color={ORANGE} />
        <Stat label="Por pagar" value={fmtMoney(payableCents)} sub={`${payables.length} documentos`} href="/dashboard/gastos?ver=porpagar" icon={HandCoins} color="#2f6fb0" />
        <Stat
          label="Vencidas"
          value={String(overdue.length)}
          sub={overdue.length ? fmtMoney(overdue.reduce((a, p) => a + p.amountCents, 0)) : "Nada vencido"}
          href="/dashboard/gastos?ver=porpagar"
          icon={CalendarClock}
          color={overdue.length ? "#e5533f" : "#0f9f8f"}
        />
        <Stat label="Con RUC (deducibles)" value={`${withRuc} de ${suppliers.length}`} sub="Los demás: notas de venta o sin documento" icon={Truck} color="#6b4fb5" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Directorio" className="lg:col-span-2" aside={<Link href="/dashboard/gastos/nuevo" className="text-[#2f6fb0] hover:underline">+ Registrar gasto</Link>}>
          {suppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin gastos registrados en {year}. Llegan de los XML del SRI y del extracto del banco.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Proveedor</th>
                    <th className="hidden py-2 pr-3 font-medium md:table-cell">Rubro</th>
                    <th className="py-2 pr-3 text-right font-medium">Docs</th>
                    <th className="py-2 pr-3 text-right font-medium">Compras {year}</th>
                    <th className="py-2 text-right font-medium">Por pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.key} className="border-b last:border-0 hover:bg-stone-50">
                      <td className="py-2 pr-3">
                        <Link href={`/dashboard/finanzas/proveedores/${s.key}`} className="font-medium hover:underline">{s.name}</Link>
                        <p className="text-xs text-muted-foreground">
                          {s.ruc ? `RUC ${s.ruc}` : "Sin RUC"}
                          {view === "ALL" && ` · ${s.sedes.map((x) => ENTITIES[x].name.replace("La Cueva ", "")).join(", ")}`}
                        </p>
                      </td>
                      <td className="hidden py-2 pr-3 text-muted-foreground md:table-cell">{EXPENSE_CATEGORY_LABELS[s.topCategory]}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.docs}</td>
                      <td className="py-2 pr-3 text-right tabular-nums font-medium">{fmtMoney(s.yearCents)}</td>
                      <td className={`py-2 text-right tabular-nums ${s.payableCents ? "text-amber-700" : "text-muted-foreground"}`}>{s.payableCents ? fmtMoney(s.payableCents) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title={`Principales proveedores ${year}`}>
          <BarList
            rows={suppliers.slice(0, 8).map((s) => ({ label: s.name, cents: s.yearCents, href: `/dashboard/finanzas/proveedores/${s.key}` }))}
            color={ORANGE}
            empty="Sin compras."
          />
        </Panel>
      </div>
    </div>
  );
}
