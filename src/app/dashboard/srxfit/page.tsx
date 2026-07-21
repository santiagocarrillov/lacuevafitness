import Link from "next/link";
import { requireAuth, getSedeScope, can } from "@/lib/auth";
import { getSrxfitHubStats } from "@/lib/actions/srxfit";

export const dynamic = "force-dynamic";

export default async function SrxfitPage() {
  const user = await requireAuth();
  const scope = getSedeScope(user);
  const stats = await getSrxfitHubStats(scope ?? undefined);

  const sedeLabel = scope === "FITNESS_CENTER" ? "Fitness Center"
    : scope === "XTREME" ? "Xtreme" : "Ambas sedes";

  // Same permissions the top-nav items used before they moved into this hub.
  const showNutricion = can.editBodyComp(user);
  const showRetos =
    can.manageChallenges(user) || user.role === "COACH" || user.role === "NUTRITIONIST";
  const showNotificaciones = can.manageMembers(user);

  return (
    <div className="p-8 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">SRXFit</h1>
        <p className="text-sm text-muted-foreground">
          Evaluaciones · Programación · Nutrición · Retos · Comunicación · {sedeLabel}
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

      {/* Gestión del método — lo que hace único a SRXFit */}
      {(showNutricion || showRetos || showNotificaciones) && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Gestión del método
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {showNutricion && (
              <ModuleCard
                href="/dashboard/nutricion"
                title="Nutrición"
                description="Planes alimenticios, prioridad de la semana y cápsulas de consejos que ven los socios en su app."
                badge="Nutrición"
                badgeColor="bg-emerald-100 text-emerald-800"
              />
            )}
            {showRetos && (
              <ModuleCard
                href="/dashboard/retos"
                title="Retos"
                description="Crea y administra los retos de asistencia y de métricas SRXFIT (gamificación) para los socios."
                badge="Retos"
                badgeColor="bg-amber-100 text-amber-800"
              />
            )}
            {showNotificaciones && (
              <ModuleCard
                href="/dashboard/notificaciones"
                title="Notificaciones"
                description="Envía avisos push a los socios (broadcast o por sede). Comunicación directa a su teléfono."
                badge="Comunicación"
                badgeColor="bg-sky-100 text-sky-800"
              />
            )}
          </div>
        </section>
      )}

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
  href, title, description, badge, badgeColor, stats = [], note,
}: {
  href: string;
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  stats?: Array<{ label: string; value: number | string }>;
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
