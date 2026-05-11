import Link from "next/link";
import { redirect } from "next/navigation";
import { Sede } from "@/generated/prisma/client";
import { requireAuth, getSedeScope, can } from "@/lib/auth";
import { getEvaluationCompliance, getBodyFatMetrics, getMembersEvalStatus } from "@/lib/actions/srxfit";
import { ComplianceGauge } from "./compliance-gauge";
import { EvaluacionesTable } from "./evaluaciones-table";
import { EvalDateRangePicker } from "./eval-date-range-picker";

export const dynamic = "force-dynamic";

const sedes = [
  { key: "", label: "Ambas" },
  { key: "FITNESS_CENTER", label: "Fitness Center" },
  { key: "XTREME", label: "Xtreme" },
];

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

export default async function EvaluacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string; from?: string; to?: string }>;
}) {
  const user = await requireAuth();
  if (!can.editTests(user) && !can.manageMembers(user)) redirect("/dashboard/srxfit?forbidden=1");

  const scopedSede = getSedeScope(user);
  const params = await searchParams;

  const now = new Date();
  const from = params.from ?? isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = params.to ?? isoDate(now);
  const sede = (scopedSede ?? (params.sede as Sede | undefined | "")) as "" | Sede;

  function buildUrl(updates: Record<string, string>) {
    const p = new URLSearchParams({ sede: sede as string, from, to, ...updates });
    return `/dashboard/srxfit/evaluaciones?${p.toString()}`;
  }

  const sedeForQuery = sede ? (sede as Sede) : undefined;

  const [compliance, fatMetrics, members] = await Promise.all([
    getEvaluationCompliance(sedeForQuery, from, to),
    getBodyFatMetrics(sedeForQuery, from, to),
    getMembersEvalStatus(sedeForQuery, from, to),
  ]);

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href="/dashboard/srxfit" className="text-sm text-muted-foreground hover:text-foreground">
              SRXFit
            </Link>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-2xl font-semibold">Tests y Evaluaciones</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Registro individual y reporte de cumplimiento del ciclo.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 border-b pb-4">
        {!scopedSede && (
          <div className="flex gap-1">
            {sedes.map((s) => (
              <Link
                key={s.key}
                href={buildUrl({ sede: s.key })}
                className={`px-2.5 py-1 text-xs rounded-md border transition ${
                  sede === s.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-accent"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        )}
        <EvalDateRangePicker from={from} to={to} sede={sede as string} />
      </div>

      {/* Compliance gauges */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          % Cumplimiento de evaluaciones
        </h2>
        <div className="flex flex-wrap gap-8 items-center">
          {compliance.map((c) => (
            <ComplianceGauge
              key={c.label}
              pct={c.pct}
              label={c.label}
              total={c.totalActive}
              evaluated={c.evaluated}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Verde ≥ 90% · Amarillo ≥ 60% · Rojo &lt; 60% — período: {from} → {to}
        </p>
      </section>

      {/* Global metrics */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border p-5 space-y-1">
          <p className="text-3xl font-bold">{fatMetrics.totalKgFatLost} kg</p>
          <p className="text-sm text-muted-foreground">Grasa perdida (total global)</p>
          <p className="text-xs text-muted-foreground">
            Entre socios con 2+ mediciones en el período
          </p>
        </div>
        <div className="rounded-lg border p-5 space-y-1">
          <p className="text-3xl font-bold">{fatMetrics.membersImproved}</p>
          <p className="text-sm text-muted-foreground">Socios con pérdida de grasa</p>
          <p className="text-xs text-muted-foreground">
            De {members.length} socios activos
          </p>
        </div>
        <div className="rounded-lg border p-5 space-y-1">
          <p className="text-3xl font-bold">
            {members.filter((m) => m.status === "evaluado").length}
          </p>
          <p className="text-sm text-muted-foreground">Evaluaciones completadas</p>
          <p className="text-xs text-muted-foreground">
            {members.filter((m) => m.status === "parcial").length} en progreso
          </p>
        </div>
      </section>

      {/* Top fat loss */}
      {fatMetrics.top.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Top pérdida de grasa
          </h2>
          <div className="rounded-lg border divide-y divide-border">
            {fatMetrics.top.map((m, i) => (
              <div key={m.name} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="w-5 text-muted-foreground text-xs font-mono">{i + 1}</span>
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.sede === "FITNESS_CENTER" ? "Fitness" : "Xtreme"}
                  </span>
                </div>
                <span className="font-semibold text-green-700">−{m.kgFatLost} kg</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Members table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Socios — {members.length} activos
          </h2>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-400" /> Pendiente
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> Parcial
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400" /> Evaluado
            </span>
          </div>
        </div>
        <EvaluacionesTable members={members} from={from} to={to} />
      </section>
    </div>
  );
}
