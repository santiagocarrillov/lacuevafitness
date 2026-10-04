import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENTITIES, fmtMoney, monthLabel } from "@/lib/finance/entities";
import { computeLine } from "@/lib/payroll/compute";
import { ecuadorDateString } from "@/lib/timezone";
import { PageHeader } from "../../../../page-header";
import { Panel } from "../../../../blocks";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { DRAFT: "Borrador", APPROVED: "Aprobado", PAID: "Pagado", VOIDED: "Anulado" };

export default async function TrabajadorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const e = await prisma.employee.findUnique({
    where: { id },
    include: { payrollLines: { include: { run: true }, orderBy: { run: { period: "desc" } }, take: 36 } },
  });
  if (!e) notFound();
  const today = ecuadorDateString();
  const dep = e.employmentType === "DEPENDENCIA";
  const est = computeLine(
    { ...e, startDate: e.startDate.toISOString().slice(0, 10) },
    { daysWorked: 30, overtime50Hours: 0, overtime100Hours: 0, bonusCents: 0, otherDeductionsCents: 0, incomeTaxCents: null },
    today.slice(0, 7),
  );
  const lines = e.payrollLines.filter((l) => l.run.status !== "VOIDED");

  // Benefits accrued (not paid monthly) in the current legal periods.
  const y = Number(today.slice(0, 4));
  const d13From = today.slice(5, 7) === "12" ? `${y}-12` : `${y - 1}-12`;
  const d14From = Number(today.slice(5, 7)) >= 8 ? `${y}-08` : `${y - 1}-08`;
  const posted = lines.filter((l) => l.run.status === "APPROVED" || l.run.status === "PAID");
  const acc13 = e.monthlyDecimoTercero ? 0 : posted.filter((l) => l.run.period >= d13From).reduce((a, l) => a + l.decimoTerceroCents, 0);
  const acc14 = e.monthlyDecimoCuarto ? 0 : posted.filter((l) => l.run.period >= d14From).reduce((a, l) => a + l.decimoCuartoCents, 0);
  const vac = posted.reduce((a, l) => a + l.vacationCents, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={`${e.firstName} ${e.lastName}`}
        subtitle={[e.position, ENTITIES[e.sede].name, e.idNumber ? `CI ${e.idNumber}` : null, !e.active ? "Ya no trabaja" : null].filter(Boolean).join(" · ")}
      >
        <Link href={`/dashboard/finanzas/trabajadores/equipo/${e.id}/editar`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-300 px-3.5 text-sm font-medium hover:border-stone-500">
          <Pencil className="size-3.5" /> Editar
        </Link>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Contrato">
          <dl className="space-y-1.5 text-sm">
            {[
              ["Tipo", dep ? "Relación de dependencia" : "Servicios profesionales"],
              ["Ingreso", e.startDate.toISOString().slice(0, 10)],
              ["Salida", e.endDate ? e.endDate.toISOString().slice(0, 10) : null],
              ["Sueldo", fmtMoney(e.monthlySalaryCents, { decimals: true })],
              ["Jornada", e.weeklyHours >= 40 ? "Completa (40 h)" : `Parcial (${e.weeklyHours} h por semana)`],
              ...(dep
                ? [
                    ["IESS", e.iessAffiliated ? "Afiliado" : "Sin afiliar"],
                    ["Décimo tercero", e.monthlyDecimoTercero ? "Mensualizado" : "Acumulado (dic.)"],
                    ["Décimo cuarto", e.monthlyDecimoCuarto ? "Mensualizado" : "Acumulado (ago.)"],
                    ["Fondos de reserva", e.monthlyFondosReserva ? "En el rol" : "Al IESS"],
                  ]
                : []),
              ["Banco", [e.bankName, e.bankAccount].filter(Boolean).join(" · ") || null],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className={v ? "" : "text-muted-foreground"}>{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        {dep ? (
          <Panel title="Un mes completo, hoy" className="lg:col-span-2">
            <div className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              {[
                ["Sueldo", est.grossCents],
                ["Aporte personal IESS (9,45 %)", -est.iessPersonalCents],
                ["Retención de IR sugerida", -est.incomeTaxCents],
                ["Fondos de reserva", e.monthlyFondosReserva ? est.fondosReservaCents : 0],
                ["Décimo tercero", e.monthlyDecimoTercero ? est.decimoTerceroCents : 0],
                ["Décimo cuarto", e.monthlyDecimoCuarto ? est.decimoCuartoCents : 0],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between border-b py-1">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="tabular-nums">{fmtMoney(v as number, { decimals: true })}</span>
                </div>
              ))}
              <div className="flex justify-between py-1 font-semibold">
                <span>Recibe</span>
                <span className="tabular-nums">{fmtMoney(est.netCents, { decimals: true })}</span>
              </div>
              <div className="flex justify-between py-1 font-semibold">
                <span>Le cuesta a la empresa</span>
                <span className="tabular-nums">{fmtMoney(est.employerCostCents, { decimals: true })}</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Décimo tercero acumulado</p>
                <p className="font-medium tabular-nums">{e.monthlyDecimoTercero ? "Mensualizado" : fmtMoney(acc13, { decimals: true })}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Décimo cuarto acumulado</p>
                <p className="font-medium tabular-nums">{e.monthlyDecimoCuarto ? "Mensualizado" : fmtMoney(acc14, { decimals: true })}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vacaciones provisionadas</p>
                <p className="font-medium tabular-nums">{fmtMoney(vac, { decimals: true })}</p>
              </div>
            </div>
            {!est.rulesExact && <p className="mt-2 text-xs text-amber-700">Usa las reglas de {est.rulesYear}: falta cargar el salario básico de este año.</p>}
          </Panel>
        ) : (
          <Panel title="Honorarios" className="lg:col-span-2">
            <p className="text-sm text-muted-foreground">
              No entra en el rol de pagos. Sus pagos se registran como gasto con su factura o liquidación de compra (cuenta Honorarios de coaches).
            </p>
            <Link href="/dashboard/gastos?categoria=COACH_FEES&rango=anio" className="mt-3 inline-block text-sm text-[#2f6fb0] hover:underline">Ver honorarios del año ›</Link>
          </Panel>
        )}
      </div>

      {dep && (
        <Panel title="Roles de pago">
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no aparece en ningún rol.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Mes</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 pr-3 text-right font-medium">Días</th>
                  <th className="py-2 pr-3 text-right font-medium">Ingresos</th>
                  <th className="py-2 text-right font-medium">Recibió</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-stone-50">
                    <td className="py-2 pr-3">
                      <Link href={`/dashboard/finanzas/trabajadores/roles/${l.runId}/recibo/${l.id}`} className="inline-block hover:underline first-letter:uppercase">{monthLabel(l.run.period)}</Link>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{STATUS[l.run.status]}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.daysWorked}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtMoney(l.grossCents, { decimals: true })}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{fmtMoney(l.netCents, { decimals: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}
    </div>
  );
}
