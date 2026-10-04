import Link from "next/link";
import { redirect } from "next/navigation";
import { Sede } from "@/generated/prisma/client";
import { requireAuth, getSedeScope, can } from "@/lib/auth";
import { getBodyFatMetrics, getMembersEvalStatus } from "@/lib/actions/srxfit";
import { ComplianceGauge } from "./compliance-gauge";
import { EvaluacionesTable, sortEvalRows } from "./evaluaciones-table";
import { EvalPanel } from "./eval-panel";
import { loadEvalPanel } from "@/lib/srxfit/eval-panel";
import { EVAL_COMPLETE_PCT, STATUS_COLOR, STATUS_LABEL, type EvalStatus } from "@/lib/srxfit/eval-score";
import { EvalDateRangePicker } from "./eval-date-range-picker";
import { GroupDashboard } from "./group-dashboard";
import { groupEvaluationStats } from "@/lib/srxfit/group-stats";

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
  searchParams: Promise<{ sede?: string; from?: string; to?: string; socio?: string }>;
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

  const [group, fatMetrics, members, panel] = await Promise.all([
    groupEvaluationStats({ sede: sedeForQuery ?? null }),
    getBodyFatMetrics(sedeForQuery, from, to),
    getMembersEvalStatus(sedeForQuery, from, to),
    params.socio ? loadEvalPanel(params.socio, from, to) : null,
  ]);

  // Gauges come from the same rows as the table, so both always agree.
  const compliance = (sedeForQuery ? [sedeForQuery] : [undefined, "FITNESS_CENTER", "XTREME"] as const).map((s) => {
    const rows = s ? members.filter((m) => m.sede === s) : members;
    const evaluated = rows.filter((m) => m.status === "evaluado").length;
    return {
      label: s === "FITNESS_CENTER" ? "Fitness Center" : s === "XTREME" ? "Xtreme" : "Ambas sedes",
      totalActive: rows.length,
      evaluated,
      pct: rows.length ? Math.round((evaluated / rows.length) * 100) : 0,
    };
  });

  const counts = { pendiente: 0, parcial: 0, evaluado: 0 } as Record<EvalStatus, number>;
  for (const m of members) counts[m.status]++;

  const openHref = (memberId: string) => buildUrl({ socio: memberId });
  const closeHref = buildUrl({});
  // Prev / next follow the table order, so the coach can go down the list.
  const order = sortEvalRows(members).map((m) => m.memberId);
  const at = panel ? order.indexOf(panel.member.id) : -1;
  const prevHref = at > 0 ? openHref(order[at - 1]) : null;
  const nextHref = at >= 0 && at < order.length - 1 ? openHref(order[at + 1]) : null;
  const panelAllowed =
    panel && (!scopedSede || panel.member.sede === scopedSede || members.some((m) => m.memberId === panel.member.id));

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

      <GroupDashboard s={group} />

      <h2 className="border-t pt-6 text-lg font-semibold">Detalle del período</h2>

      {/* Compliance gauges */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          % Cumplimiento de evaluaciones
        </h2>
        <div className="flex flex-wrap gap-4">
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
          Un socio está evaluado cuando su evaluación del período llega al {EVAL_COMPLETE_PCT}% (cada test pesa distinto).
          Medidor: verde ≥ 90% · ámbar ≥ 60% · rojo &lt; 60% — período: {from} → {to}
        </p>
      </section>

      {/* Global metrics */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-1">
          <p className="text-3xl font-bold">{fatMetrics.totalKgFatLost} kg</p>
          <p className="text-sm text-muted-foreground">Grasa perdida (total global)</p>
          <p className="text-xs text-muted-foreground">
            Entre socios con 2+ mediciones en el período
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-1">
          <p className="text-3xl font-bold">{fatMetrics.membersImproved}</p>
          <p className="text-sm text-muted-foreground">Socios con pérdida de grasa</p>
          <p className="text-xs text-muted-foreground">
            De {members.length} socios activos
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-1">
          <p className="text-3xl font-bold">{counts.evaluado}</p>
          <p className="text-sm text-muted-foreground">Evaluaciones completas (≥ {EVAL_COMPLETE_PCT}%)</p>
          <p className="text-xs text-muted-foreground">{counts.parcial} en progreso</p>
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
          <div className="flex gap-3 text-xs text-muted-foreground">
            {(["pendiente", "parcial", "evaluado"] as const).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[k] }} />
                {STATUS_LABEL[k]} · {counts[k]}
              </span>
            ))}
          </div>
        </div>
        <EvaluacionesTable members={members} openHref={openHref} />
      </section>

      {panel && panelAllowed && (
        <EvalPanel
          key={panel.member.id}
          data={panel}
          from={from}
          to={to}
          closeHref={closeHref}
          prevHref={prevHref}
          nextHref={nextHref}
          canEditTests={can.editTests(user)}
          canEditBody={can.editTests(user) || can.editBodyComp(user)}
        />
      )}
    </div>
  );
}
