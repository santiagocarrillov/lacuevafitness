import { Sede } from "@/generated/prisma/client";
import { getAttendanceReport } from "@/lib/actions/reports";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { CUOTA_GRACE_DAYS, STANDING_LABEL, type PaymentStanding } from "@/lib/payments/standing";

const PAYMENT_CARDS: { key: PaymentStanding; filter: string; color: string; hint: string }[] = [
  { key: "AL_DIA", filter: "al_dia", color: "text-emerald-700", hint: "cuotas a hoy pagadas y confirmadas" },
  { key: "POR_VERIFICAR", filter: "por_verificar", color: "text-amber-600", hint: "alcanza si se confirman los pendientes" },
  { key: "ATRASADO", filter: "atrasado", color: "text-red-700", hint: "plan vigente, deben cuotas" },
  { key: "VENCIDO", filter: "vencido", color: "text-red-700", hint: "su último plan ya terminó" },
  { key: "SIN_PLAN", filter: "sin_plan", color: "text-muted-foreground", hint: "nunca tuvieron un plan" },
];

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
  const sociosHref = (pago: string) =>
    `/dashboard/socios?${new URLSearchParams({ status: "ACTIVE", pago, ...(sede ? { sede } : {}) })}`;
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {PAYMENT_CARDS.map((c) => (
            <Link key={c.key} href={sociosHref(c.filter)} className="block rounded-xl transition hover:ring-2 hover:ring-primary/30">
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <CardDescription>{STANDING_LABEL[c.key]}</CardDescription>
                  <CardTitle className={`text-3xl ${c.color}`}>{r.payment[c.key]}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">{c.hint}</CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          &quot;Al día&quot; = pagos confirmados que cubren las cuotas vencidas a hoy (precio ÷ meses del plan, una
          por mes desde el inicio, con {CUOTA_GRACE_DAYS} días de gracia). Cuentan también los pagos del socio que
          no están asignados a su membresía. Si solo alcanza sumando transferencias/TC sin confirmar, queda
          &quot;pendiente de verificar&quot;.
          {r.payment.STAFF > 0 && ` No incluye ${r.payment.STAFF} del staff que entrena gratis.`}
        </p>
      </section>
    </div>
  );
}
