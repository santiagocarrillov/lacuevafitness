import { Sede } from "@/generated/prisma/client";
import { getManagementKPIs } from "@/lib/actions/reports";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanPieChart } from "./plan-pie-chart";
import { TargetsEditor } from "./targets-editor";

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}
function fmtMoney(cents: number) {
  return `$${(cents / 100).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function KPI({
  label,
  value,
  targetPct,
  hint,
}: {
  label: string;
  value: string | number;
  targetPct?: number;
  hint?: string;
}) {
  const colorClass =
    targetPct === undefined
      ? ""
      : targetPct >= 90
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : targetPct >= 60
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-700 border-red-200";

  return (
    <div className="flex items-center justify-between p-3 rounded-md border">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {targetPct !== undefined && (
        <Badge variant="outline" className={`text-xs ${colorClass}`}>
          {fmtPct(targetPct)}
        </Badge>
      )}
    </div>
  );
}

export async function GestionTab({
  sede,
  year,
  month,
}: {
  sede?: Sede;
  year: number;
  month: number;
}) {
  const kpis = await getManagementKPIs(sede, year, month);

  const metaVentasDiaria = kpis.targets?.salesTarget && kpis.targets?.workingDays
    ? kpis.targets.salesTarget / kpis.targets.workingDays
    : 0;
  const metaVisitaDiaria = kpis.targets?.visitorsTarget && kpis.targets?.workingDays
    ? kpis.targets.visitorsTarget / kpis.targets.workingDays
    : 0;

  return (
    <div className="space-y-6">
      {/* Indicadores de lectura diaria */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium bg-blue-50 text-blue-900 px-3 py-1.5 rounded">
          Indicadores de lectura diaria
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <KPI label="Ventas" value={kpis.sales} targetPct={kpis.pctMetaVentas} />
          <KPI label="ACTIVOS Totales" value={kpis.activeMembers} />
          <KPI label="Ticket Promedio" value={fmtMoney(Math.round(kpis.ticketPromedio * 100))} hint="Referencial al cierre del periodo" />
          <KPI label="Efectividad de ventas" value={fmtPct(kpis.efectividadVentas)} targetPct={kpis.efectividadVentas} hint="Ventas / Visitantes" />
          <KPI label="Índice Renovación" value={fmtPct(kpis.indiceRenovacion)} targetPct={kpis.indiceRenovacion} />
          <KPI label="Tasa de uso" value={kpis.activeMembers > 0 ? (kpis.totalAttendance / kpis.activeMembers / 4.3).toFixed(2) : "0.00"} hint="Veces/semana promedio" />
          <KPI label="Índice de Agendamiento" value={fmtPct(kpis.indiceAgendamiento)} targetPct={kpis.indiceAgendamiento} hint="Agendados / Leads" />
          <KPI label="% Rotación" value={fmtPct(kpis.rotacionPct)} hint="Bajas del mes" />
          <KPI label="Índice de Invitación" value={fmtPct(kpis.indiceInvitacion)} targetPct={kpis.indiceInvitacion} hint="Asistieron C.P. / Agendados" />
          <KPI label="% Meta Facturación" value={fmtPct(kpis.pctMetaFacturacion)} targetPct={kpis.pctMetaFacturacion} />
          <KPI label="% Meta Averiguadores" value={fmtPct(kpis.pctMetaAveriguadores)} targetPct={kpis.pctMetaAveriguadores} />
          <KPI label="% Meta Asistencia" value={fmtPct(kpis.pctMetaAsistencia)} targetPct={kpis.pctMetaAsistencia} />
        </div>
      </section>

      {/* Metas */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium bg-orange-50 text-orange-900 px-3 py-1.5 rounded flex items-center justify-between">
          <span>Metas del mes</span>
          {sede && <TargetsEditor sede={sede} year={year} month={month} current={kpis.targets} />}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Meta de ventas" value={kpis.targets?.salesTarget ?? 0} hint={`${metaVentasDiaria.toFixed(1)} / día`} />
          <KPI label="Meta visitantes" value={kpis.targets?.visitorsTarget ?? 0} hint={`${metaVisitaDiaria.toFixed(1)} / día`} />
          <KPI label="Meta averiguadores" value={kpis.targets?.leadsTarget ?? 0} />
          <KPI label="Meta facturación" value={fmtMoney((kpis.targets?.revenueTargetCents ?? 0))} />
          <KPI label="Días hábiles" value={kpis.targets?.workingDays ?? 21} />
          <KPI label="ICV % proyectado" value={fmtPct(kpis.targets?.projectedICVPct ?? 50)} />
          <KPI label="Facturación real" value={fmtMoney(kpis.revenueCents)} />
          <KPI label="Meta asistencia" value={kpis.targets?.attendanceTarget ?? 0} hint={`Actual: ${kpis.totalAttendance}`} />
        </div>
      </section>

      {/* Embudo */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium bg-purple-50 text-purple-900 px-3 py-1.5 rounded">
          Embudo del mes
        </h2>
        <div className="grid grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Visitantes</CardDescription>
              <CardTitle className="text-3xl">{kpis.leads}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Agendados</CardDescription>
              <CardTitle className="text-3xl">{kpis.leadsScheduled}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Asistencia a invitación</CardDescription>
              <CardTitle className="text-3xl">{kpis.trialsAttended}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ventas</CardDescription>
              <CardTitle className="text-3xl">{kpis.sales}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Perfil de Planes / Venta */}
      {kpis.planBreakdown.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium bg-purple-50 text-purple-900 px-3 py-1.5 rounded">
            Perfil de Planes / Venta
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Ventas por plan</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {kpis.planBreakdown.map((p) => (
                    <div key={p.planId} className="flex justify-between py-1 border-b last:border-0">
                      <span>{p.planName}</span>
                      <Badge variant="outline">{p.count}</Badge>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 font-semibold">
                    <span>Total</span>
                    <span>{kpis.planBreakdown.reduce((s, p) => s + p.count, 0)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Distribución</CardTitle></CardHeader>
              <CardContent className="h-64">
                <PlanPieChart data={kpis.planBreakdown.map((p) => ({ name: p.planName, value: p.count }))} />
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}
