import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import { shortDate } from "@/lib/portal/format";
import { TEST_LABELS } from "@/lib/portal/test-labels";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  ONBOARDING: "Onboarding",
  CYCLE_9_WEEK: "Ciclo 9 semanas",
  AD_HOC: "Ad-hoc",
};

export default async function EvalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member } = await requireMember();

  // Scope by member: a socio can only ever open their own evaluation.
  const evaluation = await prisma.evaluation.findFirst({
    where: { id, memberId: member.id },
    include: {
      coach: { select: { fullName: true } },
      testResults: { orderBy: { recordedAt: "desc" } },
      bodyCompositions: { orderBy: { measuredAt: "desc" }, take: 1 },
    },
  });
  if (!evaluation) notFound();

  const initial = member.firstName.charAt(0).toUpperCase();
  const bc = evaluation.bodyCompositions[0] ?? null;

  return (
    <PortalShell avatarInitial={initial}>
      <Link
        href="/portal/cuenta/evaluaciones"
        style={{ fontSize: 11, color: "var(--pt-ink-3)", textDecoration: "none" }}
      >
        ← Evaluaciones
      </Link>
      <div style={{ margin: "12px 0 18px" }}>
        <div className="portal-kicker">
          {shortDate(evaluation.completedAt ?? evaluation.startedAt)}
          {evaluation.cycleNumber ? ` · Ciclo ${evaluation.cycleNumber}` : ""}
        </div>
        <h2 className="portal-title">
          {TYPE_LABEL[evaluation.type] ?? evaluation.type}
        </h2>
      </div>

      {evaluation.summary && (
        <div className="portal-nutri" style={{ marginBottom: 14 }}>
          <div className="who">
            <div className="av">
              {(evaluation.coach?.fullName ?? "C").charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="name">{evaluation.coach?.fullName ?? "Tu coach"}</div>
              <div className="role">Tu coach revisó esto · La Cueva</div>
            </div>
          </div>
          <div className="body">{evaluation.summary}</div>
        </div>
      )}

      {/* Resultados de tests */}
      <div className="portal-section-title">
        <h4>Resultados</h4>
      </div>
      {evaluation.testResults.length === 0 ? (
        <div className="portal-card">
          <p style={{ fontSize: 13, color: "var(--pt-ink-2)" }}>Sin tests registrados.</p>
        </div>
      ) : (
        <div className="portal-card" style={{ display: "grid", gap: 10 }}>
          {evaluation.testResults.map((t) => (
            <div
              key={t.id}
              style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}
            >
              <span style={{ fontSize: 14 }}>{TEST_LABELS[t.test]?.label ?? t.test}</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {t.valueNumeric}
                <span style={{ fontSize: 11, color: "var(--pt-ink-3)", marginLeft: 3 }}>
                  {t.unit || TEST_LABELS[t.test]?.unit}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Composición corporal de la evaluación */}
      {bc && (
        <>
          <div className="portal-section-title">
            <h4>Composición</h4>
          </div>
          <div className="portal-card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {bc.weightKg != null && <Stat label="Peso" value={`${bc.weightKg} kg`} />}
            {bc.bodyFatPct != null && <Stat label="% Grasa" value={`${bc.bodyFatPct}%`} />}
            {bc.muscleMassPct != null && <Stat label="% Músculo" value={`${bc.muscleMassPct}%`} />}
            {bc.basalMetabolism != null && <Stat label="Metabolismo basal" value={`${bc.basalMetabolism} kcal`} />}
          </div>
        </>
      )}
    </PortalShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--pt-ink-3)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
