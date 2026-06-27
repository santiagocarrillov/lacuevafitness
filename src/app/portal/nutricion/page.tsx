import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import { shortDate } from "@/lib/portal/format";

export const dynamic = "force-dynamic";

export default async function NutricionPage() {
  const { member } = await requireMember();

  const plans = await prisma.mealPlan.findMany({
    where: { memberId: member.id, active: true, visibleToMember: true },
    orderBy: { createdAt: "desc" },
  });

  const initial = member.firstName.charAt(0).toUpperCase();

  return (
    <PortalShell avatarInitial={initial}>
      <div style={{ marginBottom: 18 }}>
        <div className="portal-kicker">Nutrición</div>
        <h2 className="portal-title">
          Mi <em>plan</em>
        </h2>
      </div>

      {plans.length === 0 ? (
        <div className="portal-card">
          <p style={{ fontSize: 13, color: "var(--pt-ink-2)" }}>
            Tu nutricionista aún no ha compartido un plan. Cuando lo haga, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {plans.map((p) => (
            <div key={p.id} className="portal-card">
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 500 }}>{p.title}</div>
                {p.calorieTarget && (
                  <div style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>{p.calorieTarget} kcal</div>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--pt-ink-3)", marginTop: 2 }}>
                Desde {shortDate(p.startsAt ?? p.createdAt)}
              </div>
              {p.externalUrl && (
                <a
                  href={p.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    marginTop: 8,
                    fontSize: 13,
                    color: "var(--pt-accent, var(--pt-green))",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                  }}
                >
                  Ver plan alimenticio →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
