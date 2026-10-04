import Link from "next/link";
import { redirect } from "next/navigation";
import { BookPlus, FileInput, FileText, Plus, Receipt, Upload, type LucideIcon } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { ecuadorDateString } from "@/lib/timezone";
import { ENTITIES, monthLabel } from "@/lib/finance/entities";
import { computeHome, parseEntityView, type EntityView } from "@/lib/finance/home";
import { EntityPills, MonthNav, PageHeader } from "../page-header";
import { ProcessFlow } from "./process-flow";
import { BanksCard, BreakdownCard, CashFlowCard, OwnersCard, PayablesCard, ProfitLossCard, TaxesCard } from "./home-cards";

export const dynamic = "force-dynamic";

// Before the redesign (4 oct 2026) each area was a ?tab= of this page.
const OLD_TABS: Record<string, string> = {
  resumen: "/dashboard/finanzas/reportes/resultados",
  banco: "/dashboard/finanzas/banco",
  aportes: "/dashboard/finanzas/aportes",
  otros: "/dashboard/finanzas/otros-ingresos",
  impuestos: "/dashboard/finanzas/impuestos",
  gastos: "/dashboard/gastos",
};

const ACTIONS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Factura", href: "/dashboard/facturas/nueva", icon: FileText },
  { label: "Gasto", href: "/dashboard/gastos/nuevo", icon: Receipt },
  { label: "Facturas del SRI", href: "/dashboard/gastos/importar-sri", icon: FileInput },
  { label: "Extracto del banco", href: "/dashboard/finanzas/banco/importar", icon: Upload },
  { label: "Asiento", href: "/dashboard/contabilidad?tab=nuevo", icon: BookPlus },
];

export default async function ContabilidadInicio({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; mes?: string; cuenta?: string; entidad?: string }>;
}) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");

  const params = await searchParams;
  if (params.tab && OLD_TABS[params.tab]) {
    const q = new URLSearchParams();
    if (params.mes) q.set("mes", params.mes);
    if (params.cuenta) q.set("cuenta", params.cuenta);
    redirect(`${OLD_TABS[params.tab]}${q.size ? `?${q}` : ""}`);
  }

  const today = ecuadorDateString();
  const thisMonth = today.slice(0, 7);
  const ym = /^\d{4}-\d{2}$/.test(params.mes ?? "") && params.mes! <= thisMonth ? params.mes! : thisMonth;
  const view = parseEntityView(params.entidad);
  const href = (u: { mes?: string; entidad?: EntityView }) => {
    const q = new URLSearchParams();
    const m = u.mes ?? ym;
    const e = u.entidad ?? view;
    if (m !== thisMonth) q.set("mes", m);
    if (e !== "ALL") q.set("entidad", e);
    return `/dashboard/finanzas${q.size ? `?${q}` : ""}`;
  };

  const data = await computeHome(ym, view, today);
  const canEdit = can.editFinancials(user);

  return (
    <div className="mx-auto max-w-7xl space-y-7 p-4 md:p-8">
      <PageHeader
        title="Contabilidad"
        subtitle={
          view === "ALL"
            ? `Vista consolidada · ${data.sedes.map((s) => ENTITIES[s].name).join(" + ")}`
            : `${ENTITIES[view].legalName}${ENTITIES[view].ruc ? ` · RUC ${ENTITIES[view].ruc}` : ""}`
        }
      >
        <EntityPills view={view} href={(v) => href({ entidad: v })} />
        <MonthNav ym={ym} thisMonth={thisMonth} href={(m) => href({ mes: m })} />
      </PageHeader>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-medium text-muted-foreground">Crear</span>
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.label}
                href={a.href}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-sm font-medium transition hover:border-stone-500 hover:bg-stone-50"
              >
                <Plus className="size-3.5 text-muted-foreground" />
                <Icon className="size-3.5" />
                {a.label}
              </Link>
            );
          })}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Flujo de trabajo</h2>
        <ProcessFlow data={data} ym={ym} today={today} />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Cómo va el negocio en {monthLabel(ym)}
        </h2>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <ProfitLossCard data={data} ym={ym} />
          <BreakdownCard
            title="Ingresos"
            slices={data.incomeSlices}
            totalCents={data.incomeCents}
            empty="Todavía no hay cobros este mes."
            footer={<Link href="/dashboard/pagos" className="font-medium text-[#2f6fb0] hover:underline">Ver cobros ›</Link>}
          />
          <BreakdownCard
            title="Gastos"
            slices={data.expenseSlices}
            totalCents={data.expensesCents}
            empty="No hay gastos registrados este mes. Llegan del extracto del banco y de los XML del SRI."
            footer={<Link href={`/dashboard/gastos?mes=${ym}`} className="font-medium text-[#2f6fb0] hover:underline">Ver gastos ›</Link>}
          />
          <CashFlowCard data={data} ym={ym} />
          <BanksCard data={data} />
          <TaxesCard data={data} today={today} />
          <PayablesCard data={data} today={today} />
          <OwnersCard data={data} ym={ym} />
        </div>
      </div>
    </div>
  );
}
