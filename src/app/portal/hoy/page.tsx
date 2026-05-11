import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import {
  HITOS,
  computeStreak,
  daysToNextEvaluation,
  greetingForHour,
} from "@/lib/portal/metrics";
import { ecuadorHour, ecuadorParts, todayDayOfWeekEcuador } from "@/lib/portal/tz";
import { longDate } from "@/lib/portal/format";

export const dynamic = "force-dynamic";

export default async function HoyPage() {
  const { member } = await requireMember();

  const today = new Date();
  const todayWeekday = todayDayOfWeekEcuador();

  const [attendanceDates, attendanceCount, lastEval, todaySchedules] = await Promise.all([
    prisma.attendance
      .findMany({
        where: { memberId: member.id },
        orderBy: { recordedAt: "desc" },
        select: { recordedAt: true },
        take: 200,
      })
      .then((rows) => rows.map((r) => r.recordedAt)),
    prisma.attendance.count({ where: { memberId: member.id } }),
    prisma.evaluation.findFirst({
      where: { memberId: member.id, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    prisma.classSchedule.findMany({
      where: { sede: member.sede, dayOfWeek: todayWeekday, active: true },
      orderBy: { startTime: "asc" },
    }),
  ]);

  const streak = computeStreak(attendanceDates, today);
  const daysLeft = daysToNextEvaluation(lastEval?.completedAt ?? null, today);
  const greeting = greetingForHour(ecuadorHour(today));
  const initial = member.firstName.charAt(0).toUpperCase();
  const nextSession = todaySchedules[0] ?? null;
  const { year, month, day } = ecuadorParts(today);
  const friendlyDate = longDate(new Date(year, month - 1, day));

  return (
    <PortalShell avatarInitial={initial}>
      <div style={{ marginBottom: 18 }}>
        <div className="portal-kicker">{friendlyDate}</div>
        <h2 className="portal-title">
          {greeting},<br />
          <em>{member.firstName}.</em>
        </h2>
      </div>

      {streak >= 2 && (
        <div className="portal-streak">
          <div className="flame">{streak}</div>
          <div className="info">
            <div className="num">{streak} semanas seguidas</div>
            <div className="label">Racha activa</div>
          </div>
          <div className="next">
            Sigue así
            <br />
            1 sem más
          </div>
        </div>
      )}

      {nextSession ? (
        <div className="portal-today">
          <div className="ribbon" />
          <div className="tag">
            <span className="dot" />
            Hoy entrenas
          </div>
          <h3>{nextSession.name}</h3>
          <div className="subtitle">
            Sede {member.sede === "FITNESS_CENTER" ? "Fitness Center" : "Xtreme"}
          </div>
          <div className="meta-row">
            <div className="meta-item">
              <div className="k">Hora</div>
              <div className="v">{nextSession.startTime}</div>
            </div>
            <div className="meta-item">
              <div className="k">Cupo</div>
              <div className="v">{nextSession.capacity}</div>
            </div>
            <div className="meta-item">
              <div className="k">Duración</div>
              <div className="v">{nextSession.durationMin} min</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="portal-today">
          <div className="ribbon" style={{ background: "var(--pt-ink-4)" }} />
          <div className="tag">
            <span className="dot" />
            Día libre
          </div>
          <h3>Sin clases hoy</h3>
          <div className="subtitle">Aprovecha para regular o caminar 7,000 pasos.</div>
        </div>
      )}

      {daysLeft !== null && (
        <div className="portal-countdown">
          <div className="days">{Math.max(daysLeft, 0)}</div>
          <div className="info">
            <div className="label">Próxima reevaluación SRXFit</div>
            <div className="title">
              {daysLeft < 0
                ? "Ya toca agendar tu nuevo ciclo"
                : daysLeft <= 14
                  ? "Agéndala con tu coach esta semana"
                  : "Cierra el ciclo de 9 semanas"}
            </div>
          </div>
        </div>
      )}

      <div className="portal-section-title">
        <h4>Hitos en curso</h4>
      </div>
      {HITOS.map((h) => {
        const pct = Math.min(100, Math.round((attendanceCount / h.target) * 100));
        const done = attendanceCount >= h.target;
        const fillClass = done ? "fill done" : h.target === 100 ? "fill gold" : "fill";
        return (
          <div key={h.target} className="portal-hito">
            <div className={`icon${done ? " done" : ""}`}>{done ? "✓" : h.target}</div>
            <div className="info">
              <div className="name">{h.label}</div>
              <div className="progress-row">
                <div className="bar">
                  <div className={fillClass} style={{ width: `${pct}%` }} />
                </div>
                <div className="pct">
                  {Math.min(attendanceCount, h.target)}/{h.target}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="portal-section-title">
        <h4>Sabías que…</h4>
      </div>
      <div className="portal-capsule">
        <div className="label">SRXFit · Cápsula</div>
        <h5>Por qué medimos cintura, no solo peso</h5>
        <div className="read">2 min · próximamente</div>
      </div>
    </PortalShell>
  );
}
