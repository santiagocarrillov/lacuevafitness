import { Sede } from "@/generated/prisma/client";
import { getAttendanceReport } from "@/lib/actions/reports";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export async function AsistenciaTab({
  sede,
  from,
  to,
}: {
  sede?: Sede;
  from: string;
  to: string;
}) {
  const r = await getAttendanceReport(sede, from, to);
  const avgVisits =
    r.attendance.uniqueMembers > 0
      ? (r.attendance.totalVisits / r.attendance.uniqueMembers).toFixed(1)
      : "—";

  return (
    <div className="space-y-6">
      {/* ── Socios únicos que asistieron ─────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium bg-blue-50 text-blue-900 px-3 py-1.5 rounded">
          Asistencia del período (socios únicos, no visitas)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Socios únicos que asistieron</CardDescription>
              <CardTitle className="text-3xl">{r.attendance.uniqueMembers}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              personas distintas que vinieron al menos una vez
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Visitas totales</CardDescription>
              <CardTitle className="text-3xl">{r.attendance.totalVisits}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              incluye visitas repetidas del mismo socio
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Promedio de visitas por socio</CardDescription>
              <CardTitle className="text-3xl">{avgVisits}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              visitas totales ÷ socios únicos
            </CardContent>
          </Card>
        </div>
        {r.attendance.perSede && (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Únicos · Fitness Center</CardDescription>
                <CardTitle className="text-2xl">{r.attendance.perSede.FITNESS_CENTER}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Únicos · Xtreme</CardDescription>
                <CardTitle className="text-2xl">{r.attendance.perSede.XTREME}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}
        {r.attendance.perSede && (
          <p className="text-xs text-muted-foreground">
            El total de únicos ({r.attendance.uniqueMembers}) puede ser menor que la suma por
            sede si algún socio asistió en las dos sedes (se cuenta una sola vez en el total).
          </p>
        )}
      </section>

      {/* ── Activos que asistieron (engagement) ──────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium bg-emerald-50 text-emerald-900 px-3 py-1.5 rounded">
          De los socios activos, ¿cuántos asistieron?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Socios activos</CardDescription>
              <CardTitle className="text-3xl">{r.active.total}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">activos + trial</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Asistieron</CardDescription>
              <CardTitle className="text-3xl text-emerald-700">
                {r.active.attended}
                <span className="text-base font-normal text-muted-foreground ml-2">
                  ({r.active.engagementPct}%)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              activos con ≥1 visita en el período
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>No asistieron</CardDescription>
              <CardTitle className="text-3xl text-amber-700">{r.active.notAttended}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              activos sin ninguna visita — riesgo de baja
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Engagement</CardDescription>
              <CardTitle className="text-3xl">{r.active.engagementPct}%</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              asistieron ÷ activos
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Estado de pago de activos ────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium bg-purple-50 text-purple-900 px-3 py-1.5 rounded">
          De los socios activos, ¿cuántos están al día?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Al día</CardDescription>
              <CardTitle className="text-3xl text-emerald-700">{r.payment.alDia}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              membresía vigente (no vencida)
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Deben / vencidos</CardDescription>
              <CardTitle className="text-3xl text-red-700">{r.payment.debe}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              membresía vencida o pendiente de pago
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Sin membresía</CardDescription>
              <CardTitle className="text-3xl text-muted-foreground">{r.payment.sinMembresia}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              activos sin un plan asignado
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground">
          &quot;Al día&quot; = tiene una membresía vigente (no vencida). El estado de pago se basa en la
          vigencia de la membresía; para que refleje bien lo cobrado, los pagos deben estar
          asignados a la membresía del socio.
        </p>
      </section>
    </div>
  );
}
