import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import { WeightChart } from "@/components/portal/weight-chart";
import { computeImc, interpretImc } from "@/lib/portal/metrics";
import { FEATURED_PRS, TEST_LABELS } from "@/lib/portal/test-labels";
import { shortDate } from "@/lib/portal/format";

export const dynamic = "force-dynamic";

export default async function ProgresoPage() {
  const { member } = await requireMember();

  const [bodyComps, latestEval, nutriNote, prResults] = await Promise.all([
    prisma.bodyComposition.findMany({
      where: { memberId: member.id },
      orderBy: { measuredAt: "desc" },
      take: 6,
    }),
    prisma.evaluation.findFirst({
      where: { memberId: member.id, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    prisma.memberNote.findFirst({
      where: {
        memberId: member.id,
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
  ]);

  const latest = bodyComps[0] ?? null;
  const imc = computeImc(latest?.weightKg ?? null, latest?.heightCm ?? null);
  const imcInterp = imc ? interpretImc(imc) : null;

  // Chart points: oldest → newest, keep only entries with a weight.
  const chartData = [...bodyComps]
    .reverse()
    .filter((b) => b.weightKg != null)
    .map((b) => ({
      date: shortDate(b.measuredAt),
      weight: b.weightKg!,
    }));
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

      {latest ? (
        <div className="portal-metric-grid">
          {imc != null && imcInterp && (
            <div className="portal-metric">
              <span className={`dot ${imcInterp.dot}`} />
              <div className="label">IMC</div>
              <div className="value">{imc.toFixed(1)}</div>
              <div className="interp">{imcInterp.text}</div>
            </div>
          )}
          {latest.waistCm != null && (
            <div className="portal-metric">
              <span className="dot orange" />
              <div className="label">Cintura</div>
              <div className="value">
                {latest.waistCm.toFixed(1)}
                <span className="u">cm</span>
              </div>
              <div className="interp">Medida abdominal.</div>
            </div>
          )}
          {latest.bodyFatPct != null && (
            <div className="portal-metric">
              <span className="dot gray" />
              <div className="label">% Grasa</div>
              <div className="value">
                {latest.bodyFatPct.toFixed(1)}
                <span className="u">%</span>
              </div>
              <div className="interp">Composición corporal.</div>
            </div>
          )}
          {latest.muscleMassPct != null && (
            <div className="portal-metric">
              <span className="dot green" />
              <div className="label">% Músculo</div>
              <div className="value">
                {latest.muscleMassPct.toFixed(1)}
                <span className="u">%</span>
              </div>
              <div className="interp">Masa muscular.</div>
            </div>
          )}
        </div>
      ) : (
        <div className="portal-card" style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 13, color: "var(--pt-ink-2)" }}>
            Aún no tienes una evaluación de composición corporal. Pide a tu nutricionista que
            te programe una.
          </p>
        </div>
      )}

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
    </PortalShell>
  );
}
