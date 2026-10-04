import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENTITIES, ENTITY_ORDER, fmtMoney } from "@/lib/finance/entities";
import { parseEntityView, type EntityView } from "@/lib/finance/home";
import { computeLine } from "@/lib/payroll/compute";
import { ecuadorDateString } from "@/lib/timezone";
import { EntityPills, PageHeader } from "../../../page-header";

export const dynamic = "force-dynamic";

const PURPLE = "#6b4fb5";

export default async function EquipoPage({ searchParams }: { searchParams: Promise<{ entidad?: string; ver?: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const params = await searchParams;
  const view = parseEntityView(params.entidad);
  const showAll = params.ver === "todos";
  const period = ecuadorDateString().slice(0, 7);
  const href = (u: { entidad?: EntityView; ver?: string | null }) => {
    const q = new URLSearchParams();
    const e = u.entidad ?? view;
    if (e !== "ALL") q.set("entidad", e);
    const v = u.ver === undefined ? (showAll ? "todos" : null) : u.ver;
    if (v) q.set("ver", v);
    return `/dashboard/finanzas/trabajadores/equipo${q.size ? `?${q}` : ""}`;
  };

  const people = await prisma.employee.findMany({
    where: { sede: { in: view === "ALL" ? ENTITY_ORDER : [view] }, ...(showAll ? {} : { active: true }) },
    orderBy: [{ employmentType: "asc" }, { lastName: "asc" }],
  });
  const cost = (e: (typeof people)[number]) =>
    e.employmentType === "DEPENDENCIA"
      ? computeLine({ ...e, startDate: e.startDate.toISOString().slice(0, 10) }, { daysWorked: 30, overtime50Hours: 0, overtime100Hours: 0, bonusCents: 0, otherDeductionsCents: 0, incomeTaxCents: null }, period).employerCostCents
      : e.monthlySalaryCents;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Equipo" subtitle="Quiénes trabajan en cada empresa, con qué contrato y cuánto cuestan al mes (sueldo + IESS + beneficios).">
        <EntityPills view={view} href={(v) => href({ entidad: v })} />
        <Link href={href({ ver: showAll ? null : "todos" })} className="text-xs text-muted-foreground hover:text-foreground">
          {showAll ? "Solo activos" : "Ver también los que ya salieron"}
        </Link>
        <Link href="/dashboard/finanzas/trabajadores/equipo/nuevo" className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: PURPLE }}>
          <Plus className="size-4" /> Trabajador
        </Link>
      </PageHeader>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        {people.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Todavía no hay trabajadores. Agrégalos con su contrato para generar el rol de pagos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-stone-50/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Trabajador</th>
                  <th className="px-3 py-2.5 font-medium">Contrato</th>
                  {view === "ALL" && <th className="hidden px-3 py-2.5 font-medium md:table-cell">Empresa</th>}
                  <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Ingreso</th>
                  <th className="px-3 py-2.5 text-right font-medium">Sueldo</th>
                  <th className="px-4 py-2.5 text-right font-medium">Costo mensual</th>
                </tr>
              </thead>
              <tbody>
                {people.map((e) => (
                  <tr key={e.id} className={`border-b last:border-0 hover:bg-stone-50 ${e.active ? "" : "text-muted-foreground"}`}>
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/finanzas/trabajadores/equipo/${e.id}`} className="font-medium hover:underline">{e.firstName} {e.lastName}</Link>
                      <p className="text-xs text-muted-foreground">{e.position ?? "—"}{!e.active && e.endDate ? ` · salió el ${e.endDate.toISOString().slice(0, 10)}` : ""}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {e.employmentType === "DEPENDENCIA" ? (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-800">Dependencia{e.weeklyHours < 40 ? ` · ${e.weeklyHours} h` : ""}</span>
                      ) : (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 font-medium text-stone-700">Honorarios</span>
                      )}
                      {e.employmentType === "DEPENDENCIA" && !e.iessAffiliated && <span className="ml-1 text-red-700">sin IESS</span>}
                    </td>
                    {view === "ALL" && <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{ENTITIES[e.sede].name.replace("La Cueva ", "")}</td>}
                    <td className="hidden px-3 py-2.5 tabular-nums text-muted-foreground sm:table-cell">{e.startDate.toISOString().slice(0, 10)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(e.monthlySalaryCents, { decimals: true })}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{e.active ? fmtMoney(cost(e), { decimals: true }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
