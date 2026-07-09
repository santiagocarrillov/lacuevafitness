import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import { shortDate } from "@/lib/portal/format";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  ONBOARDING: "Onboarding",
  CYCLE_9_WEEK: "Ciclo 9 semanas",
  AD_HOC: "Ad-hoc",
};

const TEST_LABEL: Record<string, string> = {
  BACK_SQUAT_3RM: "Back Squat 3RM", DEADLIFT_3RM: "Deadlift 3RM",
  BENCH_PRESS_3RM: "Bench Press 3RM", PUSH_PRESS_3RM: "Push Press 3RM",
  DEAD_HANG_SECONDS: "Dead Hang", PULL_UPS_MAX: "Pull-ups",
  RING_ROW_ANGLE: "Ring Row (ángulo)", PLANK_SECONDS: "Plank",
  CHRISTINE_TIME_SECONDS: "Christine (3 RFT)", COOPER_METERS: "Cooper 12 min",
  CLEAN_JERK_1RM: "Clean & Jerk 1RM", SNATCH_1RM: "Snatch 1RM",
  ROW_500M_SPRINT_SECONDS: "500m Remo Sprint",
};

export default async function EvaluacionesPage() {
  const { member } = await requireMember();
  const evals = await prisma.evaluation.findMany({
    where: { memberId: member.id },
    orderBy: { startedAt: "desc" },
    include: { _count: { select: { testResults: true, bodyCompositions: true } } },
  });
  // Standalone tests (not part of a full evaluation) — measured ad-hoc.
  const looseTests = await prisma.testResult.findMany({
    where: { memberId: member.id, evaluationId: null },
    orderBy: { recordedAt: "desc" },
  });
  const initial = member.firstName.charAt(0).toUpperCase();

  return (
    <PortalShell avatarInitial={initial}>
      <Link
        href="/portal/cuenta"
        style={{ fontSize: 11, color: "var(--pt-ink-3)", textDecoration: "none" }}
      >
        ← Mi cuenta
      </Link>
      <div style={{ margin: "12px 0 18px" }}>
        <div className="portal-kicker">{evals.length} evaluaciones</div>
        <h2 className="portal-title">
          Tus <em>evaluaciones</em>
        </h2>
      </div>
      {evals.length === 0 ? (
        <div className="portal-card">
          <p style={{ fontSize: 13, color: "var(--pt-ink-2)" }}>
            Aún no tienes evaluaciones SRXFit. La primera se agenda en tu onboarding.
          </p>
        </div>
      ) : (
        evals.map((e) => (
          <Link key={e.id} href={`/portal/cuenta/evaluaciones/${e.id}`} className="portal-list-item">
            <div className="li-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M3 12h4l3-8 4 16 3-8h4" />
              </svg>
            </div>
            <div className="info">
              <div className="t">
                {TYPE_LABEL[e.type] ?? e.type}
                {e.cycleNumber ? ` · Ciclo ${e.cycleNumber}` : ""}
              </div>
              <div className="s">
                {shortDate(e.completedAt ?? e.startedAt)}
                {e.completedAt ? "" : " · en progreso"} · {e._count.testResults} tests
                {e._count.bodyCompositions
                  ? ` · ${e._count.bodyCompositions} composiciones`
                  : ""}
              </div>
            </div>
            <div className="arrow">→</div>
          </Link>
        ))
      )}

      {looseTests.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="portal-kicker">Tests sueltos</div>
          <div className="portal-card" style={{ marginTop: 8 }}>
            {looseTests.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex", justifyContent: "space-between", gap: 12,
                  padding: "8px 0", borderBottom: "1px solid var(--pt-line, #eee)",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {TEST_LABEL[t.test] ?? t.test}
                  </div>
                  {t.notes && (
                    <div style={{ fontSize: 11, color: "var(--pt-ink-3)", fontStyle: "italic" }}>
                      {t.notes}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {t.valueNumeric} <span style={{ fontWeight: 400, color: "var(--pt-ink-3)" }}>{t.unit}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--pt-ink-3)" }}>{shortDate(t.recordedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PortalShell>
  );
}
