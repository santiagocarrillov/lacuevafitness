import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENTITIES, fmtMoney, monthLabel } from "@/lib/finance/entities";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

function Row({ label, cents, strong }: { label: string; cents: number; strong?: boolean }) {
  if (!cents && !strong) return null;
  return (
    <div className={`flex justify-between py-1 ${strong ? "border-t font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{fmtMoney(cents, { decimals: true })}</span>
    </div>
  );
}

/** Individual rol de pagos: what the worker earned, what was deducted and what they receive. */
export default async function ReciboPage({ params }: { params: Promise<{ id: string; lineId: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const { id, lineId } = await params;
  const l = await prisma.payrollLine.findFirst({ where: { id: lineId, runId: id }, include: { employee: true, run: true } });
  if (!l) notFound();
  const e = l.employee;
  const ent = ENTITIES[l.run.sede];
  const fr = e.monthlyFondosReserva ? l.fondosReservaCents : 0;
  const d13 = e.monthlyDecimoTercero ? l.decimoTerceroCents : 0;
  const d14 = e.monthlyDecimoCuarto ? l.decimoCuartoCents : 0;
  const income = l.grossCents + fr + d13 + d14;
  const deductions = l.iessPersonalCents + l.incomeTaxCents + l.otherDeductionsCents;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-8">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      <article className="space-y-5 rounded-xl border border-stone-200 bg-white p-6 text-sm print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <p className="font-semibold">{ent.legalName}</p>
            {ent.ruc && <p className="text-muted-foreground">RUC {ent.ruc}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tracking-wide">ROL DE PAGOS</p>
            <p className="inline-block first-letter:uppercase">{monthLabel(l.run.period)}</p>
          </div>
        </header>
        <div className="grid grid-cols-2 gap-2">
          <p><span className="text-muted-foreground">Trabajador:</span> {e.firstName} {e.lastName}</p>
          <p><span className="text-muted-foreground">Cédula:</span> {e.idNumber ?? "—"}</p>
          <p><span className="text-muted-foreground">Cargo:</span> {e.position ?? "—"}</p>
          <p><span className="text-muted-foreground">Días trabajados:</span> {l.daysWorked}</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <section>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-600">Ingresos</h2>
            <Row label="Sueldo" cents={l.baseCents} />
            <Row label={`Horas extra (${l.overtime50Hours} al 50 %, ${l.overtime100Hours} al 100 %)`} cents={l.overtimeCents} />
            <Row label="Bonos y comisiones" cents={l.bonusCents} />
            <Row label="Fondos de reserva" cents={fr} />
            <Row label="Décimo tercero mensualizado" cents={d13} />
            <Row label="Décimo cuarto mensualizado" cents={d14} />
            <Row label="Total ingresos" cents={income} strong />
          </section>
          <section>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-600">Descuentos</h2>
            <Row label="Aporte personal IESS (9,45 %)" cents={l.iessPersonalCents} />
            <Row label="Retención de impuesto a la renta" cents={l.incomeTaxCents} />
            <Row label="Otros descuentos" cents={l.otherDeductionsCents} />
            <Row label="Total descuentos" cents={deductions} strong />
          </section>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-stone-100 px-4 py-3 text-base font-semibold">
          <span>Neto a recibir</span>
          <span className="tabular-nums">{fmtMoney(l.netCents, { decimals: true })}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          A cargo del empleador este mes: aporte patronal IESS {fmtMoney(l.iessEmployerCents, { decimals: true })}
          {!e.monthlyDecimoTercero && ` · décimo tercero acumulado ${fmtMoney(l.decimoTerceroCents, { decimals: true })}`}
          {!e.monthlyDecimoCuarto && ` · décimo cuarto acumulado ${fmtMoney(l.decimoCuartoCents, { decimals: true })}`}
          {!e.monthlyFondosReserva && l.fondosReservaCents > 0 && ` · fondos de reserva al IESS ${fmtMoney(l.fondosReservaCents, { decimals: true })}`}
          {` · vacaciones ${fmtMoney(l.vacationCents, { decimals: true })}`}.
        </p>
        <div className="grid grid-cols-2 gap-10 pt-10 text-center text-xs">
          <div className="border-t pt-1">Firma del empleador</div>
          <div className="border-t pt-1">Recibí conforme · {e.firstName} {e.lastName}</div>
        </div>
      </article>
    </div>
  );
}
