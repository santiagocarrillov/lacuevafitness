import Link from "next/link";
import { requireAuth, getSedeScope } from "@/lib/auth";
import { getNutritionCoverage } from "@/lib/actions/nutrition-appointments";
import {
  COVERAGE_LABEL,
  COVERAGE_OVERDUE_DAYS,
  daysSince,
  formatAppointmentWhen,
  type CoverageState,
} from "@/lib/nutrition/appointments";
import { Card, CardContent } from "@/components/ui/card";
import type { Sede } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const FILTERS: { key: CoverageState | "todos"; label: string }[] = [
  { key: "never", label: "Nunca atendidos" },
  { key: "overdue", label: "Toca control" },
  { key: "scheduled", label: "Con cita" },
  { key: "ok", label: "Al día" },
  { key: "todos", label: "Todos" },
];

const STATE_CLS: Record<CoverageState, string> = {
  never: "bg-red-100 text-red-800",
  overdue: "bg-amber-100 text-amber-800",
  scheduled: "bg-sky-100 text-sky-800",
  ok: "bg-emerald-100 text-emerald-800",
};

const SEDE_LABEL: Record<Sede, string> = { FITNESS_CENTER: "Fitness Center", XTREME: "Xtreme" };

function fmtDate(d: Date) {
  return d.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "short", year: "2-digit" });
}

export default async function NutricionCoberturaPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; sede?: string }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;
  const locked = getSedeScope(user);
  const sede: Sede | null =
    locked ?? (params.sede === "FITNESS_CENTER" || params.sede === "XTREME" ? params.sede : null);
  const filter = (FILTERS.find((f) => f.key === params.filtro)?.key ?? "never") as CoverageState | "todos";

  const rows = await getNutritionCoverage(sede);
  const now = new Date();
  const counts = {
    never: rows.filter((r) => r.state === "never").length,
    overdue: rows.filter((r) => r.state === "overdue").length,
    scheduled: rows.filter((r) => r.state === "scheduled").length,
    ok: rows.filter((r) => r.state === "ok").length,
  };
  const everSeen = rows.filter((r) => r.lastAttended).length;
  const pct = rows.length ? Math.round((everSeen / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => filter === "todos" || r.state === filter)
    .sort((a, b) => {
      // Most urgent first: longest without a consult, then alphabetical.
      const ta = a.lastAttended?.getTime() ?? 0;
      const tb = b.lastAttended?.getTime() ?? 0;
      return ta - tb || a.name.localeCompare(b.name, "es");
    });

  const href = (patch: Record<string, string>) => {
    const sp = new URLSearchParams({ filtro: filter, ...(sede && !locked ? { sede } : {}), ...patch });
    if (sp.get("sede") === "") sp.delete("sede");
    return `/dashboard/nutricion/cobertura?${sp.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Socios activos" value={rows.length} />
        <Stat label="Atendidos alguna vez" value={`${everSeen} · ${pct}%`} />
        <Stat label="Con cita próxima" value={counts.scheduled} />
        <Stat label={`Sin control > ${Math.round(COVERAGE_OVERDUE_DAYS / 7)} semanas`} value={counts.overdue} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={href({ filtro: f.key })}
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === f.key ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"
            }`}
          >
            {f.label}
            {f.key !== "todos" && <span className="ml-1 opacity-70">{counts[f.key]}</span>}
          </Link>
        ))}
        {!locked && (
          <div className="ml-auto flex gap-1 text-sm">
            {[
              { v: "", l: "Ambas" },
              { v: "FITNESS_CENTER", l: "Fitness Center" },
              { v: "XTREME", l: "Xtreme" },
            ].map((s) => (
              <Link
                key={s.v}
                href={href({ sede: s.v })}
                className={`rounded px-2 py-1 ${(sede ?? "") === s.v ? "bg-muted font-medium" : "text-muted-foreground"}`}
              >
                {s.l}
              </Link>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nadie en esta lista.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="px-4 py-2 font-medium">Socio</th>
                    <th className="px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2 font-medium">Última consulta</th>
                    <th className="px-4 py-2 font-medium">Próxima cita</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visible.map((r) => (
                    <tr key={r.memberId}>
                      <td className="px-4 py-2">
                        <Link href={`/dashboard/socios/${r.memberId}`} className="font-medium hover:underline">
                          {r.name}
                        </Link>
                        {!sede && <span className="block text-xs text-muted-foreground">{SEDE_LABEL[r.sede]}</span>}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${STATE_CLS[r.state]}`}>
                          {COVERAGE_LABEL[r.state]}
                        </span>
                        {r.noShows > 0 && (
                          <span className="ml-2 text-xs text-red-700">
                            {r.noShows} {r.noShows === 1 ? "falta" : "faltas"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {r.lastAttended
                          ? `${fmtDate(r.lastAttended)} · hace ${daysSince(r.lastAttended, now)} d`
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {r.nextScheduled ? formatAppointmentWhen(r.nextScheduled) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {!r.nextScheduled && (
                          <Link
                            href={`/dashboard/nutricion?nuevo=${r.memberId}`}
                            className="text-xs font-medium hover:underline"
                          >
                            Agendar →
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
