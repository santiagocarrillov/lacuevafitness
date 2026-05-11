import Link from "next/link";
import { requireAuth, getSedeScope } from "@/lib/auth";
import { getSrxfitHubStats } from "@/lib/actions/srxfit";

export const dynamic = "force-dynamic";

export default async function SrxfitPage() {
  const user = await requireAuth();
  const scope = getSedeScope(user);
  const stats = await getSrxfitHubStats(scope ?? undefined);

  const sedeLabel = scope === "FITNESS_CENTER" ? "Fitness Center"
    : scope === "XTREME" ? "Xtreme" : "Ambas sedes";

  return (
    <div className="p-8 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">SRXFit</h1>
        <p className="text-sm text-muted-foreground">
          Metodología · Evaluaciones · Programación de 18 semanas · {sedeLabel}
        </p>
      </header>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Socios activos" value={stats.totalMembers} />
        <StatCard label="Evaluaciones este mes" value={stats.evalsThisMonth} />
        <StatCard label="Evaluaciones completadas" value={stats.completedEvals} />
        <StatCard label="Comp. corporal registradas" value={stats.withBodyComp} />
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ModuleCard
          href="/dashboard/srxfit/evaluaciones"
          title="Tests y Evaluaciones"
          description="Registra baterías de tests por socio, composición corporal y visualiza el reporte de cumplimiento del ciclo."
          badge="Parte 1"
          badgeColor="bg-blue-100 text-blue-800"
          stats={[
            { label: "Iniciadas", value: stats.evalsThisMonth },
            { label: "Completadas", value: stats.completedEvals },
          ]}
        />
        <ModuleCard
          href="/dashboard/srxfit/calendario"
          title="Calendario de Programación"
          description="Visualiza las 108 sesiones del plan de 18 semanas. Click en cualquier día para ver la sesión completa con instrucciones para coaches."
          badge="Parte 2"
          badgeColor="bg-purple-100 text-purple-800"
          stats={[
            { label: "Semanas", value: 18 },
            { label: "Sesiones", value: 108 },
          ]}
          note="Inicia lunes 4 mayo 2026"
        />
      </div>

      {/* Methodology summary */}
      <section className="rounded-lg border p-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Ciclo actual
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[
            { phase: "Aprender", color: "bg-blue-100 text-blue-800", weeks: "1–2, 5–6, 10–11, 14–15" },
            { phase: "Desarrollar", color: "bg-amber-100 text-amber-800", weeks: "2–3, 6–7, 11–12, 15–16" },
            { phase: "Desafiar", color: "bg-rose-100 text-rose-800", weeks: "3, 7, 12, 16" },
            { phase: "Recuperar", color: "bg-green-100 text-green-800", weeks: "4, 8, 13, 17" },
          ].map((p) => (
            <div key={p.phase} className="space-y-1">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${p.color}`}>
                {p.phase}
              </span>
              <p className="text-xs text-muted-foreground">Semanas {p.weeks}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground pt-1">
          Re-evaluación grupal: semanas 9 y 18. La entrega de comparativas del Día 4 (Cooper) es la palanca de retención más fuerte del sistema.
        </p>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4 space-y-1">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ModuleCard({
  href, title, description, badge, badgeColor, stats, note,
}: {
  href: string;
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  stats: Array<{ label: string; value: number | string }>;
  note?: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border p-6 space-y-4 hover:bg-accent transition block group"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold group-hover:text-primary transition">{title}</h2>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>
          {badge}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="flex gap-6">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-lg font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </Link>
  );
}
