import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import { JoinButton } from "@/components/portal/join-button";
import { shortDate } from "@/lib/portal/format";

export const dynamic = "force-dynamic";

export default async function RetosPage() {
  const { member } = await requireMember();
  const now = new Date();

  const [progressRows, openChallenges] = await Promise.all([
    prisma.challengeProgress.findMany({
      where: { memberId: member.id },
      include: { challenge: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.challenge.findMany({
      where: {
        active: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
        OR: [
          { sede: null },
          { sede: { in: member.secondarySede ? [member.sede, member.secondarySede] : [member.sede] } },
        ],
      },
      orderBy: { endsAt: "asc" },
    }),
  ]);

  const joinedIds = new Set(progressRows.map((p) => p.challengeId));
  const active = progressRows.filter(
    (p) => !p.completed && p.challenge.active && p.challenge.endsAt >= now,
  );
  const won = progressRows.filter((p) => p.completed);
  const available = openChallenges.filter((c) => !joinedIds.has(c.id));

  const initial = member.firstName.charAt(0).toUpperCase();

  return (
    <PortalShell avatarInitial={initial}>
      <div style={{ marginBottom: 18 }}>
        <div className="portal-kicker">
          {active.length} activos · {available.length} disponibles
        </div>
        <h2 className="portal-title">
          Tus <em>retos</em>
        </h2>
      </div>

      {active.length === 0 && available.length === 0 && won.length === 0 && (
        <div className="portal-card">
          <p style={{ fontSize: 13, color: "var(--pt-ink-2)" }}>
            Por ahora no hay retos vigentes. Pronto habrá novedades 👀
          </p>
        </div>
      )}

      {active.length > 0 && (
        <>
          <div className="portal-section-title">
            <h4>Retos vigentes</h4>
          </div>
          {active.map((p, idx) => {
            const pct = Math.min(
              100,
              Math.round((p.currentCount / Math.max(p.challenge.ruleTarget, 1)) * 100),
            );
            const featured = idx === 0;
            const ruleHint =
              p.challenge.ruleType === "CONSECUTIVE_CLASSES"
                ? "Sin faltar"
                : p.challenge.ruleType === "CLASSES_IN_DAYS"
                  ? `En ${p.challenge.ruleDays} días`
                  : "Asistencias acumuladas";
            return (
              <div key={p.id} className={`portal-reto${featured ? " featured" : ""}`}>
                <div className="tag">● {featured ? "Reto del mes" : "En curso"}</div>
                <h4>{p.challenge.name}</h4>
                {p.challenge.description && (
                  <p
                    style={{
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: featured ? "rgba(255,255,255,0.75)" : "var(--pt-ink-2)",
                      marginBottom: 10,
                    }}
                  >
                    {p.challenge.description}
                  </p>
                )}
                {p.challenge.reward && (
                  <div className="prize">
                    Premio: <strong>{p.challenge.reward}</strong>
                  </div>
                )}
                <div className="bar">
                  <div className="fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="meta">
                  <span>
                    {p.currentCount} / {p.challenge.ruleTarget} · {ruleHint}
                  </span>
                  <span>Termina: {shortDate(p.challenge.endsAt)}</span>
                </div>
              </div>
            );
          })}
        </>
      )}

      {available.length > 0 && (
        <>
          <div className="portal-section-title">
            <h4>Disponible para unirse</h4>
          </div>
          {available.map((c) => (
            <div key={c.id} className="portal-reto">
              <div className="tag">○ Inscribirme</div>
              <h4>{c.name}</h4>
              {c.description && (
                <p
                  style={{
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "var(--pt-ink-2)",
                    marginBottom: 10,
                  }}
                >
                  {c.description}
                </p>
              )}
              {c.reward && (
                <div className="prize">
                  Premio: <strong>{c.reward}</strong>
                </div>
              )}
              <div className="meta">
                <span>Inicia {shortDate(c.startsAt)}</span>
                <span>Cierra {shortDate(c.endsAt)}</span>
              </div>
              <JoinButton challengeId={c.id} />
            </div>
          ))}
        </>
      )}

      {won.length > 0 && (
        <>
          <div className="portal-section-title">
            <h4>Conquistados</h4>
          </div>
          {won.map((p) => (
            <div key={p.id} className="portal-reto-won">
              <div className="check">✓</div>
              <div style={{ flex: 1 }}>
                <div className="name">{p.challenge.name}</div>
                <div className="when">
                  {shortDate(p.completedAt)}
                  {p.challenge.reward ? ` · ${p.challenge.reward}` : ""}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </PortalShell>
  );
}
