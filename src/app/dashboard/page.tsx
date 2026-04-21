import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDashboardStats } from "@/lib/actions/attendance";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const stats = await getDashboardStats();

  const kpis = [
    {
      label: "Socios activos",
      value: stats.activeMembers.toString(),
      hint: "Ambas sedes (ACTIVE + TRIAL)",
    },
    {
      label: "Asistencias hoy",
      value: stats.todayAttendance.toString(),
      hint: "Registros confirmados por admin",
    },
    {
      label: "Membresías vencidas",
      value: stats.expiredMemberships.toString(),
      hint: "Activas con fecha de fin pasada",
      alert: stats.expiredMemberships > 0,
    },
    {
      label: "Renovaciones próximos 7d",
      value: stats.upcomingRenewals.toString(),
      hint: "Membresías que vencen esta semana",
      alert: stats.upcomingRenewals > 0,
    },
    {
      label: "Discrepancias hoy",
      value: stats.todayDiscrepancies.toString(),
      hint: "Admin vs coach — conteo diferente",
      alert: stats.todayDiscrepancies > 0,
    },
  ];

  return (
    <div className="p-8 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Resumen</h1>
        <p className="text-sm text-zinc-400">
          Indicadores en vivo de La Cueva Fitness Center y La Cueva Xtreme.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-zinc-900 border-zinc-800 text-zinc-50">
            <CardHeader className="pb-2">
              <CardDescription className="text-zinc-400 flex items-center gap-2">
                {k.label}
                {"alert" in k && k.alert && (
                  <Badge variant="destructive" className="text-xs">
                    Atención
                  </Badge>
                )}
              </CardDescription>
              <CardTitle className="text-3xl">{k.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-zinc-500">{k.hint}</CardContent>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-zinc-900 border-zinc-800 text-zinc-50">
          <CardHeader>
            <CardTitle>Discrepancias del día</CardTitle>
            <CardDescription className="text-zinc-400">
              Admin vs. coach — antifraude de conteo de clases.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-zinc-400">
            {stats.todayDiscrepancies === 0
              ? "✅ Sin discrepancias hoy."
              : `🚨 ${stats.todayDiscrepancies} clase(s) con conteo distinto.`}
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800 text-zinc-50">
          <CardHeader>
            <CardTitle>SRXFit — Próximo ciclo</CardTitle>
            <CardDescription className="text-zinc-400">
              Semana 9 de re-evaluación y benchmarks.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-zinc-400">
            (Pendiente: módulo SRXFit — Fase 2)
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
