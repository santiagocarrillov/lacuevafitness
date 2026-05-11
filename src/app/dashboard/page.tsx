import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDashboardStats } from "@/lib/actions/attendance";
import { requireAuth, getSedeScope, can } from "@/lib/auth";

export const dynamic = "force-dynamic";

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmt$(cents: number) {
  return `$${(cents / 100).toLocaleString("es-EC", { minimumFractionDigits: 2 })}`;
}

export default async function DashboardHome() {
  const user = await requireAuth();
  const scopedSede = getSedeScope(user);
  const stats = await getDashboardStats(scopedSede ?? undefined);
  const canReports = can.viewReports(user);

  const today = isoDate(new Date());
  const detailBase = `/dashboard/reportes/detalle?from=${today}&to=${today}`;
  const sedeParam = scopedSede ? `&sede=${scopedSede}` : "";

  const kpis: Array<{
    label: string;
    value: string;
    hint: string;
    href?: string;
    alert?: boolean;
  }> = [
    {
      label: "Socios activos",
      value: stats.activeMembers.toString(),
      hint: "ACTIVE + TRIAL",
      href: canReports ? `${detailBase}${sedeParam}&type=activos` : undefined,
    },
    {
      label: "Asistencias hoy",
      value: stats.todayAttendance.toString(),
      hint: "Registros confirmados por admin",
      href: canReports ? `${detailBase}${sedeParam}&type=asistencia` : "/dashboard/asistencia",
    },
    {
      label: "Facturación hoy",
      value: fmt$(stats.todayRevenueCents),
      hint: "Pagos confirmados del día",
      href: canReports ? `${detailBase}${sedeParam}&type=revenue` : undefined,
    },
    {
      label: "Membresías vencidas",
      value: stats.expiredMemberships.toString(),
      hint: "Activas con fecha de fin pasada",
      alert: stats.expiredMemberships > 0,
      href: canReports ? `${detailBase}${sedeParam}&type=vencidas` : undefined,
    },
    {
      label: "Renovaciones próximos 7d",
      value: stats.upcomingRenewals.toString(),
      hint: "Membresías que vencen esta semana",
      alert: stats.upcomingRenewals > 0,
      href: canReports ? `${detailBase}${sedeParam}&type=por_vencer` : undefined,
    },
    {
      label: "Discrepancias hoy",
      value: stats.todayDiscrepancies.toString(),
      hint: "Admin vs coach — conteo diferente",
      alert: stats.todayDiscrepancies > 0,
      href: canReports ? `${detailBase}${sedeParam}&type=discrepancias` : "/dashboard/asistencia",
    },
  ];

  return (
    <div className="p-8 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Resumen</h1>
        <p className="text-sm text-muted-foreground">
          Indicadores en vivo de La Cueva Fitness Center.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((k) => {
          const card = (
            <Card className={k.href ? "hover:shadow-md hover:border-primary/40 transition cursor-pointer" : ""}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  {k.label}
                  {k.alert && (
                    <Badge variant="destructive" className="text-xs">Atención</Badge>
                  )}
                  {k.href && <span className="text-primary text-xs">↗</span>}
                </CardDescription>
                <CardTitle className="text-3xl">{k.value}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{k.hint}</CardContent>
            </Card>
          );
          return k.href ? (
            <Link key={k.label} href={k.href} className="block">{card}</Link>
          ) : (
            <div key={k.label}>{card}</div>
          );
        })}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Discrepancias del día</CardTitle>
            <CardDescription>
              Admin vs. coach — antifraude de conteo de clases.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {stats.todayDiscrepancies === 0
              ? "Sin discrepancias hoy."
              : `${stats.todayDiscrepancies} clase(s) con conteo distinto.`}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>SRXFit — Próximo ciclo</CardTitle>
            <CardDescription>
              Semana 9 de re-evaluación y benchmarks.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            (Pendiente: módulo SRXFit — Fase 2)
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
