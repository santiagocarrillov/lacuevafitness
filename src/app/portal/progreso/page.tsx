import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import { WeightChart } from "@/components/portal/weight-chart";
import { SelfLog } from "@/components/portal/self-log";
import { FEATURED_PRS, TEST_LABELS } from "@/lib/portal/test-labels";
import { compareEvaluations } from "@/lib/portal/eval-compare";
import { shortDate } from "@/lib/portal/format";
import {
  bmi,
  computeAge,
  evaluateBMI,
  evaluateBodyFat,
  evaluateGlucose,
  evaluateHsCRP,
  evaluateMusclePct,
  evaluateTrigHdl,
  evaluateWHtR,
  evaluateWaist,
  longevityScore,
  recommendations,
  trend,
  trigHdl,
  whtr,
  type RangeSpec,
  type Status,
  type TrendInfo,
} from "@/lib/health-ranges";

export const dynamic = "force-dynamic";

export default async function ProgresoPage() {
  const { member } = await requireMember();

  const [bodyComps, clinicalMarkers, recentEvals, nutriNote, prResults, evalCount] = await Promise.all([
    prisma.bodyComposition.findMany({
      where: { memberId: member.id },
      orderBy: { measuredAt: "desc" },
      take: 12,
    }),
    prisma.clinicalMarker.findMany({
      where: { memberId: member.id },
      orderBy: { measuredAt: "desc" },
      take: 6,
    }),
    prisma.evaluation.findMany({
      where: { memberId: member.id, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 2,
      select: {
        completedAt: true,
        cycleNumber: true,
        summary: true,
        coach: { select: { fullName: true } },
        testResults: { select: { test: true, valueNumeric: true } },
      },
    }),
    prisma.memberNote.findFirst({
      where: {
        memberId: member.id,
        visibleToMember: true,
        author: { role: "NUTRITIONIST" },
      },
      orderBy: { createdAt: "desc" },
      include: { author: true },
    }),
    Promise.all(
      FEATURED_PRS.map(async (test) => {
        const tr = await prisma.testResult.findFirst({
          where: { memberId: member.id, test },
          orderBy: [{ valueNumeric: "desc" }, { recordedAt: "desc" }],
        });
        return tr ? { test, value: tr.valueNumeric, recordedAt: tr.recordedAt } : null;
      }),
    ),
    prisma.evaluation.count({ where: { memberId: member.id } }),
  ]);

  const age = computeAge(member.dateOfBirth);
  const sex = member.sex;
  const latestEval = recentEvals[0] ?? null;
  const prevEval = recentEvals[1] ?? null;
  const evalComparison =
    latestEval && prevEval
      ? compareEvaluations(latestEval.testResults, prevEval.testResults).filter(
          (r) => r.previous != null,
        )
      : [];
  const latestBC = bodyComps[0] ?? null;
  const prevBC = bodyComps[1] ?? null;
  const latestCM = clinicalMarkers[0] ?? null;
  const prevCM = clinicalMarkers[1] ?? null;

  const currBmi = latestBC?.weightKg && latestBC?.heightCm ? bmi(latestBC.weightKg, latestBC.heightCm) : null;
  const prevBmi = prevBC?.weightKg && prevBC?.heightCm ? bmi(prevBC.weightKg, prevBC.heightCm) : null;
  const currWHtR = latestBC?.waistCm && latestBC?.heightCm ? whtr(latestBC.waistCm, latestBC.heightCm) : null;
  const prevWHtR = prevBC?.waistCm && prevBC?.heightCm ? whtr(prevBC.waistCm, prevBC.heightCm) : null;
  const currMusclePct = latestBC?.muscleMassPct ?? (latestBC?.muscleMassKg && latestBC.weightKg ? (latestBC.muscleMassKg / latestBC.weightKg) * 100 : null);
  const prevMusclePct = prevBC?.muscleMassPct ?? (prevBC?.muscleMassKg && prevBC.weightKg ? (prevBC.muscleMassKg / prevBC.weightKg) * 100 : null);

  const currTrigHdl = latestCM?.triglycerides && latestCM?.hdlCholesterol
    ? trigHdl(latestCM.triglycerides, latestCM.hdlCholesterol) : null;
  const prevTrigHdl = prevCM?.triglycerides && prevCM?.hdlCholesterol
    ? trigHdl(prevCM.triglycerides, prevCM.hdlCholesterol) : null;

  const bfStatus = evaluateBodyFat(latestBC?.bodyFatPct, age, sex);
  const mmStatus = evaluateMusclePct(currMusclePct, age, sex);
  const waistStatus = evaluateWaist(latestBC?.waistCm, sex);
  const whtrStatus = evaluateWHtR(currWHtR);
  const bmiStatus = evaluateBMI(currBmi);
  const glucStatus = evaluateGlucose(latestCM?.glucoseFasting);
  const trigStatus = evaluateTrigHdl(currTrigHdl);
  const crpStatus = evaluateHsCRP(latestCM?.hsCRP);

  const score = longevityScore({
    glucose: glucStatus.status,
    trigHdl: trigStatus.status,
    hsCRP: crpStatus.status,
    testosterone: "unknown",
    estradiol: "unknown",
    waist: waistStatus.status,
    whtr: whtrStatus.status,
  });

  const recs = recommendations({
    glucose: glucStatus.status,
    trigHdl: trigStatus.status,
    hsCRP: crpStatus.status,
    waist: waistStatus.status,
    testosterone: "unknown",
  });

  const tWeight = trend(latestBC?.weightKg, prevBC?.weightKg, "neutral");
  const tBF = trend(latestBC?.bodyFatPct, prevBC?.bodyFatPct, "down");
  const tWaist = trend(latestBC?.waistCm, prevBC?.waistCm, "down");
  const tWHtR = trend(currWHtR, prevWHtR, "down");
  const tGluc = trend(latestCM?.glucoseFasting, prevCM?.glucoseFasting, "down");
  const tMM = trend(currMusclePct, prevMusclePct, "up");
  const tBMI = trend(currBmi, prevBmi, "neutral");
  const tTrigHdl = trend(currTrigHdl, prevTrigHdl, "down");
  const tCRP = trend(latestCM?.hsCRP, prevCM?.hsCRP, "down");

  const chartData = [...bodyComps]
    .slice(0, 6)
    .reverse()
    .filter((b) => b.weightKg != null)
    .map((b) => ({ date: shortDate(b.measuredAt), weight: b.weightKg! }));
  const weightDelta =
    chartData.length >= 2
      ? chartData[chartData.length - 1].weight - chartData[0].weight
      : null;

  const initial = member.firstName.charAt(0).toUpperCase();

  return (
    <PortalShell avatarInitial={initial}>
      <div style={{ marginBottom: 18 }}>
        <div className="portal-kicker">
          {latestEval?.completedAt
            ? `Última evaluación · ${shortDate(latestEval.completedAt)}`
            : "Aún sin evaluación SRXFit"}
        </div>
        <h2 className="portal-title">
          Mi <em>progreso</em>
        </h2>
      </div>

      <SelfLog />

      {(!age || !sex) && (
        <div className="portal-callout warn">
          <strong>Faltan datos para calcular rangos:</strong>{" "}
          {!age && "fecha de nacimiento"}
          {!age && !sex && " y "}
          {!sex && "sexo biológico"}. Pide a tu admin que los actualice.
        </div>
      )}

      {/* Hero: 6-metric snapshot */}
      {(latestBC || latestCM) && (
        <section style={{ marginBottom: 14 }}>
          <div className="portal-section-title" style={{ marginTop: 0 }}>
            <h4>Salud — Resumen</h4>
            <span className="portal-section-link" style={{ textDecoration: "none" }}>
              {bodyComps.length} mediciones · {clinicalMarkers.length} laboratorios
            </span>
          </div>
          <div className="portal-metric-grid">
            <MetricMini label="Peso" value={latestBC?.weightKg ?? null} unit="kg" trendInfo={tWeight} />
            <MetricMini label="% Grasa" value={latestBC?.bodyFatPct ?? null} unit="%" status={bfStatus.status} trendInfo={tBF} range={bfStatus.range} />
            <MetricMini label="Cintura" value={latestBC?.waistCm ?? null} unit="cm" status={waistStatus.status} trendInfo={tWaist} range={waistStatus.range} />
            <MetricMini label="C/A" value={currWHtR != null ? currWHtR.toFixed(2) : null} status={whtrStatus.status} trendInfo={tWHtR} range={whtrStatus.range} />
            <MetricMini label="Glucosa" value={latestCM?.glucoseFasting ?? null} unit="mg/dL" status={glucStatus.status} trendInfo={tGluc} range={glucStatus.range} />
            <MetricMini label="IMC" value={currBmi != null ? currBmi.toFixed(1) : null} status={bmiStatus.status} trendInfo={tBMI} range={bmiStatus.range} />
          </div>
        </section>
      )}

      {/* Composición corporal extra */}
      {latestBC && (
        <>
          <div className="portal-section-title">
            <h4>Composición corporal</h4>
          </div>
          <div className="portal-callout warn">
            <strong>IMC</strong> tiene limitaciones para deportistas. Músculo pesa más que grasa. Léelo junto con % grasa y cintura.
          </div>
          <div className="portal-metric-grid">
            <MetricMini label="% Músculo" value={currMusclePct != null ? currMusclePct.toFixed(1) : null} unit="%" status={mmStatus.status} trendInfo={tMM} range={mmStatus.range} />
            <MetricMini label="Met. basal" value={latestBC.basalMetabolism ?? null} unit="kcal" />
          </div>
        </>
      )}

      {/* Weight chart */}
      {chartData.length >= 2 && (
        <div className="portal-chart">
          <div className="head">
            <div className="t">Peso · últimas {chartData.length} mediciones</div>
            <div
              className={
                weightDelta == null
                  ? "delta-zero"
                  : weightDelta < 0
                    ? "delta-pos"
                    : "delta-neg"
              }
            >
              {weightDelta != null
                ? `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} kg`
                : "—"}
            </div>
          </div>
          <WeightChart data={chartData} />
        </div>
      )}

      {/* Longevidad clínica */}
      {(latestCM || clinicalMarkers.length > 0) && (
        <>
          <div className="portal-section-title">
            <h4>Longevidad clínica</h4>
          </div>
          <div className="portal-callout">
            ⚕️ <strong>Importante:</strong> los marcadores clínicos son para seguimiento educativo. No reemplazan evaluación médica. Valores en zona amarilla o roja persistentes requieren consulta con tu médico.
          </div>

          <div className={`portal-score ${score.status}`}>
            <div className="top">
              <div className="t">
                Score de longevidad: {score.greens} / {score.max} indicadores en verde
              </div>
              <span className={`portal-status-pill ${score.status}`}>
                {score.status === "green"
                  ? "Buen camino"
                  : score.status === "yellow"
                    ? "Zona de mejora"
                    : score.status === "red"
                      ? "Riesgo metabólico"
                      : "Sin datos"}
              </span>
            </div>
            <div className="desc">{score.interpretation}</div>
          </div>

          {recs.length > 0 && (
            <div className="portal-recs">
              <div className="label">Recomendaciones automáticas</div>
              <ul>
                {recs.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {latestCM && (
            <div className="portal-metric-grid">
              <MetricMini label="Glucosa" value={latestCM.glucoseFasting ?? null} unit="mg/dL" status={glucStatus.status} trendInfo={tGluc} range={glucStatus.range} />
              <MetricMini label="Trig/HDL" value={currTrigHdl != null ? currTrigHdl.toFixed(2) : null} status={trigStatus.status} trendInfo={tTrigHdl} range={trigStatus.range} />
              <MetricMini label="PCR-us" value={latestCM.hsCRP ?? null} unit="mg/L" status={crpStatus.status} trendInfo={tCRP} range={crpStatus.range} />
              <MetricMini label="Triglicéridos" value={latestCM.triglycerides ?? null} unit="mg/dL" />
              <MetricMini label="HDL" value={latestCM.hdlCholesterol ?? null} unit="mg/dL" />
            </div>
          )}
        </>
      )}

      {/* PRs */}
      <div className="portal-section-title">
        <h4>Mis PRs</h4>
      </div>
      {prResults.filter((p) => p != null).length === 0 ? (
        <div className="portal-card">
          <p style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
            Cuando registres tu primer test con un coach, aparecerá aquí.
          </p>
        </div>
      ) : (
        prResults.map((pr) =>
          pr ? (
            <div key={pr.test} className="portal-pr">
              <div className="icon">PR</div>
              <div className="name">{TEST_LABELS[pr.test].label}</div>
              <div className="value">
                {pr.value}
                <span className="u">{TEST_LABELS[pr.test].unit}</span>
              </div>
              <div className="date">{shortDate(pr.recordedAt)}</div>
            </div>
          ) : null,
        )
      )}

      {/* Comparativa de re-evaluación */}
      {evalComparison.length > 0 && (
        <>
          <div className="portal-section-title">
            <h4>Tu progreso vs. evaluación anterior</h4>
          </div>
          <div className="portal-card" style={{ display: "grid", gap: 12 }}>
            {evalComparison.map((r) => {
              const color =
                r.trend.isPositive === true
                  ? "var(--pt-green)"
                  : r.trend.isPositive === false
                    ? "var(--pt-red)"
                    : "var(--pt-ink-3)";
              return (
                <div
                  key={r.test}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{r.label}</div>
                    <div style={{ fontSize: 11, color: "var(--pt-ink-3)" }}>
                      {Math.round(r.previous as number)} → {Math.round(r.current)} {r.unit}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", color, flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {r.trend.arrow}{" "}
                      {r.trend.pctChange != null ? `${Math.abs(r.trend.pctChange).toFixed(0)}%` : "—"}
                    </div>
                    <div style={{ fontSize: 11 }}>{r.reading}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Nota del coach (con sello humano) */}
      {latestEval?.summary && (
        <>
          <div className="portal-section-title">
            <h4>Nota de tu coach</h4>
          </div>
          <div className="portal-nutri">
            <div className="who">
              <div className="av">
                {(latestEval.coach?.fullName ?? "C").charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="name">{latestEval.coach?.fullName ?? "Tu coach"}</div>
                <div className="role">Tu coach revisó esto · La Cueva</div>
              </div>
              {latestEval.completedAt && (
                <div className="when">{shortDate(latestEval.completedAt)}</div>
              )}
            </div>
            <div className="body">{latestEval.summary}</div>
          </div>
        </>
      )}

      {nutriNote && (
        <>
          <div className="portal-section-title">
            <h4>Nota de la nutricionista</h4>
          </div>
          <div className="portal-nutri">
            <div className="who">
              <div className="av">
                {(nutriNote.author?.fullName ?? "N").charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="name">{nutriNote.author?.fullName ?? "Nutricionista"}</div>
                <div className="role">Nutricionista · La Cueva</div>
              </div>
              <div className="when">{shortDate(nutriNote.createdAt)}</div>
            </div>
            <div className="body">{nutriNote.content}</div>
          </div>
        </>
      )}

      {/* Historial de evaluaciones (movido desde Cuenta) */}
      <div className="portal-section-title">
        <h4>Historial</h4>
      </div>
      <Link href="/portal/cuenta/evaluaciones" className="portal-list-item">
        <div className="li-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 12h4l3-8 4 16 3-8h4" />
          </svg>
        </div>
        <div className="info">
          <div className="t">Historial de evaluaciones</div>
          <div className="s">{evalCount} evaluaciones SRXFit</div>
        </div>
        <div className="arrow">→</div>
      </Link>
    </PortalShell>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────

function MetricMini({
  label,
  value,
  unit,
  status,
  range,
  trendInfo,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  status?: Status;
  range?: RangeSpec | null;
  trendInfo?: TrendInfo;
}) {
  const dotClass = !status || status === "unknown" ? "gray" : status;
  const showTrend = trendInfo && trendInfo.dir !== "none";
  const trendColor =
    trendInfo?.isPositive === true
      ? "var(--pt-green)"
      : trendInfo?.isPositive === false
        ? "var(--pt-red)"
        : "var(--pt-ink-3)";
  return (
    <div className="portal-metric">
      {status && status !== "unknown" && <span className={`dot ${dotClass}`} />}
      <div className="label">{label}</div>
      <div className="value">
        {value ?? "—"}
        {value != null && unit && <span className="u">{unit}</span>}
      </div>
      {showTrend && trendInfo && (
        <div
          className="interp"
          style={{
            fontFamily: "var(--pt-font-mono)",
            color: trendColor,
            fontSize: 10,
            marginTop: 4,
          }}
        >
          {trendInfo.arrow}
          {trendInfo.pctChange != null && Math.abs(trendInfo.pctChange) >= 0.05
            ? ` ${trendInfo.pctChange > 0 ? "+" : ""}${trendInfo.pctChange.toFixed(1)}%`
            : ""}
        </div>
      )}
      {range && (
        <div className="interp" style={{ fontSize: 9 }}>
          🟢 {range.bands.green} · 🟡 {range.bands.yellow} · 🔴 {range.bands.red}
        </div>
      )}
    </div>
  );
}
