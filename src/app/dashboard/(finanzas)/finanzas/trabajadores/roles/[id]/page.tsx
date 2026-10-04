import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENTITIES, PAY_METHOD_LABELS, fmtMoney, monthLabel } from "@/lib/finance/entities";
import { computeLine } from "@/lib/payroll/compute";
import { PAYROLL_DEADLINES } from "@/lib/payroll/rules";
import { ecuadorDateString } from "@/lib/timezone";
import { PageHeader } from "../../../../page-header";
import { Panel } from "../../../../blocks";
import { RunEditor, type EditorLine } from "./run-editor";
import { RunActions } from "./run-actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { DRAFT: "Borrador: ajusta y aprueba", APPROVED: "Aprobado y contabilizado · sueldos por pagar", PAID: "Pagado", VOIDED: "Anulado" };

export default async function RolPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: { lines: { include: { employee: true }, orderBy: { employee: { lastName: "asc" } } } },
  });
  if (!run) notFound();
  const today = ecuadorDateString();
  const editable = run.status === "DRAFT" && can.editFinancials(user);

  const lines: EditorLine[] = run.lines.map((l) => {
    const terms = { ...l.employee, startDate: l.employee.startDate.toISOString().slice(0, 10) };
    const suggested = computeLine(terms, { ...l, incomeTaxCents: null }, run.period).suggestedIncomeTaxCents;
    return {
      id: l.id,
      name: `${l.employee.firstName} ${l.employee.lastName}`,
      position: l.employee.position,
      terms,
      daysWorked: l.daysWorked,
      overtime50Hours: l.overtime50Hours,
      overtime100Hours: l.overtime100Hours,
      bonusCents: l.bonusCents,
      otherDeductionsCents: l.otherDeductionsCents,
      incomeTaxCents: l.incomeTaxCents,
      taxOverridden: l.incomeTaxCents !== suggested,
    };
  });

  const runLines = run.lines;
  const sum = (f: (l: (typeof runLines)[number]) => number) => runLines.reduce((a, l) => a + f(l), 0);
  const iessPlanilla = sum((l) => l.iessPersonalCents + l.iessEmployerCents + (l.employee.monthlyFondosReserva ? 0 : l.fondosReservaCents));
  const provisions = sum(
    (l) => (l.employee.monthlyDecimoTercero ? 0 : l.decimoTerceroCents) + (l.employee.monthlyDecimoCuarto ? 0 : l.decimoCuartoCents) + l.vacationCents,
  );
  const cost = sum((l) => l.grossCents + l.iessEmployerCents + l.fondosReservaCents + l.decimoTerceroCents + l.decimoCuartoCents + l.vacationCents);
  const payable = runLines.filter((l) => l.netCents > 0).length;
  const bankPaid = runLines.filter((l) => l.netCents > 0 && l.bankTransactionId).length;
  const [y, m] = run.period.split("-").map(Number);
  const planillaDue = new Date(Date.UTC(y, m, PAYROLL_DEADLINES.iessPlanillaDay)).toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={`Rol de pagos · ${monthLabel(run.period)}`}
        subtitle={`${ENTITIES[run.sede].legalName} · ${STATUS[run.status]}${run.paidAt ? ` el ${run.paidAt.toISOString().slice(0, 10)} (${run.paidMethod ? PAY_METHOD_LABELS[run.paidMethod] : ""})` : ""}${run.voidReason ? ` · ${run.voidReason}` : ""}`}
      >
        {can.editFinancials(user) && <RunActions id={run.id} status={run.status} today={today} />}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Netos a pagar", value: sum((l) => l.netCents), sub: `${run.lines.length} personas` },
          { label: "Planilla IESS", value: iessPlanilla, sub: `Aportes${iessPlanilla ? " + fondos al IESS" : ""} · hasta el ${planillaDue}` },
          { label: "Provisiones del mes", value: provisions, sub: "Décimos acumulados y vacaciones" },
          { label: "Costo total para la empresa", value: cost, sub: "Sueldos + IESS patronal + beneficios" },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-xs text-muted-foreground">{x.label}</p>
            <p className="text-xl font-semibold tabular-nums">{fmtMoney(x.value, { decimals: true })}</p>
            <p className="text-xs text-muted-foreground">{x.sub}</p>
          </div>
        ))}
      </div>

      {run.lines.length === 0 ? (
        <Panel title="Sin trabajadores">
          <p className="text-sm text-muted-foreground">
            No hay nadie en relación de dependencia en este mes. <Link href="/dashboard/finanzas/trabajadores/equipo/nuevo" className="text-[#2f6fb0] hover:underline">Agregar trabajador</Link>
          </p>
        </Panel>
      ) : (
        <RunEditor runId={run.id} period={run.period} lines={lines} editable={editable} />
      )}

      {run.status !== "DRAFT" && run.status !== "VOIDED" && (
        <Panel title="En la contabilidad">
          <p className="text-sm text-muted-foreground">
            Asiento del rol al {new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)}: sueldos (5.2.01) y beneficios con aporte patronal (5.2.03) contra sueldos
            por pagar, IESS, décimos, vacaciones y retenciones.{" "}
            {bankPaid === payable && payable > 0
              ? "Todos los sueldos están conciliados con el banco."
              : bankPaid > 0
                ? `${bankPaid} de ${payable} sueldos ya salieron del banco (conciliados en Caja y Bancos).`
                : run.status === "PAID"
                  ? "El pago de sueldos salió de la cuenta puente hasta conciliarlo con el banco."
                  : "Si pagas por transferencia, concilia cada débito en Caja y Bancos › Conciliar (opción «Sueldos») y el rol queda pagado solo."}{" "}
            <Link href="/dashboard/finanzas/banco/conciliar" className="text-[#2f6fb0] hover:underline">Conciliar ›</Link>{" "}
            <Link href={`/dashboard/contabilidad?tab=diario&mes=${run.period}&entidad=${run.sede}`} className="text-[#2f6fb0] hover:underline">Ver en el libro diario ›</Link>
          </p>
        </Panel>
      )}
    </div>
  );
}
