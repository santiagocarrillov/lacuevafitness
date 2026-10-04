import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENTITIES, ENTITY_ORDER, fmtMoney, monthLabel, shiftMonth } from "@/lib/finance/entities";
import { ecuadorDateString } from "@/lib/timezone";
import { PageHeader } from "../../../page-header";
import { Panel } from "../../../blocks";
import { GenerateRunButton } from "./generate-button";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Borrador", cls: "bg-amber-50 text-amber-800" },
  APPROVED: { label: "Aprobado · por pagar", cls: "bg-sky-50 text-sky-800" },
  PAID: { label: "Pagado", cls: "bg-emerald-50 text-emerald-800" },
  VOIDED: { label: "Anulado", cls: "bg-stone-100 text-stone-500" },
};

export default async function RolesPage() {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const thisMonth = ecuadorDateString().slice(0, 7);
  const [runs, staff] = await Promise.all([
    prisma.payrollRun.findMany({
      orderBy: [{ period: "desc" }, { sede: "asc" }],
      take: 48,
      include: { lines: { select: { grossCents: true, netCents: true, iessPersonalCents: true, iessEmployerCents: true, fondosReservaCents: true, decimoTerceroCents: true, decimoCuartoCents: true, vacationCents: true } } },
    }),
    prisma.employee.groupBy({ by: ["sede"], where: { active: true, employmentType: "DEPENDENCIA" }, _count: { _all: true } }),
  ]);
  const has = (sede: string, period: string) => runs.some((r) => r.sede === sede && r.period === period && r.status !== "VOIDED");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Roles de pago" subtitle="Un rol por empresa y mes. Se genera con todo el equipo en relación de dependencia, se ajustan días, horas extra y bonos, se aprueba (queda en la contabilidad) y se registra el pago." />

      <div className="grid gap-4 md:grid-cols-2">
        {ENTITY_ORDER.map((sede) => {
          const n = staff.find((s) => s.sede === sede)?._count._all ?? 0;
          const next = [shiftMonth(thisMonth, -1), thisMonth].find((p) => !has(sede, p));
          return (
            <Panel key={sede} title={ENTITIES[sede].name}>
              <p className="mb-3 text-sm text-muted-foreground">{n} {n === 1 ? "persona" : "personas"} en relación de dependencia.</p>
              {n === 0 ? (
                <Link href="/dashboard/finanzas/trabajadores/equipo/nuevo" className="text-sm text-[#2f6fb0] hover:underline">Agregar el equipo primero ›</Link>
              ) : next ? (
                <GenerateRunButton sede={sede} period={next} label={`Generar rol de ${monthLabel(next)}`} />
              ) : (
                <p className="text-sm text-emerald-700">Los roles del mes pasado y de este mes ya están creados.</p>
              )}
            </Panel>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        {runs.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Todavía no hay roles de pago.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-stone-50/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Mes</th>
                <th className="px-3 py-2.5 font-medium">Empresa</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Personas</th>
                <th className="px-3 py-2.5 text-right font-medium">Netos</th>
                <th className="px-4 py-2.5 text-right font-medium">Costo empresa</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const net = r.lines.reduce((a, l) => a + l.netCents, 0);
                const cost = r.lines.reduce((a, l) => a + l.grossCents + l.iessEmployerCents + l.fondosReservaCents + l.decimoTerceroCents + l.decimoCuartoCents + l.vacationCents, 0);
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-stone-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/finanzas/trabajadores/roles/${r.id}`} className="inline-block font-medium hover:underline first-letter:uppercase">{monthLabel(r.period)}</Link>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{ENTITIES[r.sede].name.replace("La Cueva ", "")}</td>
                    <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{r.lines.length}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(net, { decimals: true })}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmtMoney(cost, { decimals: true })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
