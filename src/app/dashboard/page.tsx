import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const kpis = [
  { label: "Socios activos", value: "—", hint: "Ambas sedes" },
  { label: "Asistencias hoy", value: "—", hint: "Admin + coach confirmado" },
  { label: "Leads nuevos", value: "—", hint: "Hoy por todos los canales" },
  { label: "Ingresos del mes", value: "—", hint: "Stripe + transferencia + efectivo" },
  { label: "Morosidad", value: "—", hint: "Membresías vencidas sin renovar" },
  { label: "Proyección renovaciones 7d", value: "—", hint: "Membresías que vencen" },
];

export default function DashboardHome() {
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
              <CardDescription className="text-zinc-400">{k.label}</CardDescription>
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
            (pendiente de wiring con datos reales)
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800 text-zinc-50">
          <CardHeader>
            <CardTitle>Próximo ciclo SRXFit</CardTitle>
            <CardDescription className="text-zinc-400">
              Semana 9 de re-evaluación y benchmarks.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-zinc-400">
            (pendiente de implementar módulo SRXFit)
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
