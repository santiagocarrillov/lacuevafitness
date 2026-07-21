import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import { shortDate } from "@/lib/portal/format";

export const dynamic = "force-dynamic";

export default async function NutricionPage() {
  const { member } = await requireMember();

  const [focus, plans, tips] = await Promise.all([
    prisma.nutritionFocus.findUnique({ where: { memberId: member.id } }),
    prisma.mealPlan.findMany({
      where: { memberId: member.id, active: true, visibleToMember: true },
      orderBy: { createdAt: "desc" },
    }),
    // Tips for the member's sede + sede-agnostic ones, most recent first.
    prisma.nutritionTip.findMany({
      where: { active: true, OR: [{ sede: member.sede }, { sede: null }] },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const initial = member.firstName.charAt(0).toUpperCase();

  return (
    <PortalShell avatarInitial={initial}>
      <div style={{ marginBottom: 18 }}>
        <div className="portal-kicker">Nutrición</div>
        <h2 className="portal-title">
          Mi <em>nutrición</em>
        </h2>
      </div>

      {/* Prioridad de la semana */}
      {focus && (
        <section
          className="portal-card"
          style={{ marginBottom: 14, borderLeft: "3px solid var(--pt-green, #16a34a)" }}
        >
          <div className="portal-kicker">Prioridad de la semana</div>
          <div style={{ fontSize: 14, color: "var(--pt-ink-1)", marginTop: 6, whiteSpace: "pre-wrap" }}>
            {focus.message}
          </div>
          <div style={{ fontSize: 11, color: "var(--pt-ink-3)", marginTop: 8 }}>
            Actualizado {shortDate(focus.updatedAt)} · tu nutricionista
          </div>
        </section>
      )}

      {/* Plan(es) */}
      <div className="portal-section-title" style={{ marginTop: 4 }}>
        <h4>Mi plan</h4>
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

      {/* Cápsulas de consejos */}
      {tips.length > 0 && (
        <>
          <div className="portal-section-title" style={{ marginTop: 20 }}>
            <h4>Cápsulas de nutrición</h4>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {tips.map((t) => (
              <div key={t.id} className="portal-card">
                <div style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--pt-ink-2)",
                    marginTop: 4,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                  }}
                >
                  {t.body}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </PortalShell>
  );
}
