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

export default async function EvaluacionesPage() {
  const { member } = await requireMember();
  const evals = await prisma.evaluation.findMany({
    where: { memberId: member.id },
    orderBy: { startedAt: "desc" },
    include: { _count: { select: { testResults: true, bodyCompositions: true } } },
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
    </PortalShell>
  );
}
