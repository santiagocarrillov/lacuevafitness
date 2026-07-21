import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import { CapsuleCard } from "@/components/portal/capsule-card";
import { MealCheck } from "@/components/portal/MealCheck";
import { RoutineWeek, type RoutineWeekData } from "@/components/portal/routine-week";
import { getWeekNumberForDate, getWeekSessions } from "@/lib/srxfit-calendar";
import { getWeekOverrides } from "@/lib/actions/srxfit-overrides";
import {
  activacionToMd,
  fuerzaToMd,
  acondicionamientoToMd,
  regulacionToMd,
} from "@/lib/srxfit-md";
import {
  HITOS,
  computeAttendanceStats,
  computeStreak,
  daysToNextEvaluation,
  greetingForHour,
} from "@/lib/portal/metrics";
import { ecuadorHour, ecuadorParts, todayDayOfWeekEcuador } from "@/lib/portal/tz";
import { longDate, shortDate } from "@/lib/portal/format";

export const dynamic = "force-dynamic";

export default async function HoyPage() {
  const { member, access } = await requireMember();

  const today = new Date();
  const todayWeekday = todayDayOfWeekEcuador();
  const { year: ecY, month: ecM, day: ecD } = ecuadorParts(today);
  const ecuadorDateUtc = new Date(Date.UTC(ecY, ecM - 1, ecD));

  const [
    attendanceDates,
    attendanceCount,
    lastEval,
    todaySchedules,
    latestNote,
    activeMealPlan,
    todayMealLog,
  ] = await Promise.all([
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
        where: {
          // Member's primary + (optional) secondary sede.
          sede: { in: member.secondarySede ? [member.sede, member.secondarySede] : [member.sede] },
          dayOfWeek: todayWeekday,
          active: true,
        },
        orderBy: { startTime: "asc" },
      }),
      prisma.memberNote.findFirst({
        where: { memberId: member.id, visibleToMember: true },
        orderBy: { createdAt: "desc" },
        include: { author: true },
      }),
      prisma.mealPlan.findFirst({
        where: { memberId: member.id, active: true, visibleToMember: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.mealLog.findUnique({
        where: { memberId_date: { memberId: member.id, date: ecuadorDateUtc } },
      }),
    ]);

  const streak = computeStreak(attendanceDates, today);
  const attStats = computeAttendanceStats(attendanceDates, today);
  const daysLeft = daysToNextEvaluation(lastEval?.completedAt ?? null, today);
  const greeting = greetingForHour(ecuadorHour(today));
  const initial = member.firstName.charAt(0).toUpperCase();
  const nextSession = todaySchedules[0] ?? null;
  const { year, month, day } = ecuadorParts(today);
  const friendlyDate = longDate(new Date(year, month - 1, day));

  // ── Rutina de la semana (SRXFit) — misma programación para todos ──
  const ecuadorLocalDate = new Date(ecY, ecM - 1, ecD);
  const weekNumber = getWeekNumberForDate(ecuadorLocalDate);
  const jsDay = ecuadorLocalDate.getDay(); // 0=Sun … 6=Sat
  const todayDayIndex = jsDay === 0 ? null : jsDay;
  const DAY_NAMES: Record<number, string> = {
    1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado",
  };
  let routineWeek: RoutineWeekData | null = null;
  if (weekNumber) {
    const overrides = await getWeekOverrides(weekNumber);
    routineWeek = {
      weekNumber,
      todayDayIndex,
      days: getWeekSessions(weekNumber).map((s) => {
        const ov = overrides[s.dayIndex];
        const sess = s.session;
        return {
          dayIndex: s.dayIndex,
          dayName: DAY_NAMES[s.dayIndex] ?? `Día ${s.dayIndex}`,
          emphasis: sess?.emphasis ?? "",
          pattern: sess?.pattern ?? "",
          dayType: sess?.dayType ?? "",
          phase: sess?.phase ?? "",
          weekSummary: sess?.weekSummary ?? "",
          activacion: ov?.activacionMd ?? (sess ? activacionToMd(sess.blocks.activacion) : ""),
          fuerza: ov?.fuerzaMd ?? (sess ? fuerzaToMd(sess.blocks.fuerza) : ""),
          acondicionamiento: ov?.acondicionamientoMd ?? (sess ? acondicionamientoToMd(sess.blocks.acondicionamiento) : ""),
          regulacion: ov?.regulacionMd ?? (sess ? regulacionToMd(sess.blocks.regulacion) : ""),
        };
      }),
    };
  }

  return (
    <PortalShell avatarInitial={initial}>
      <div style={{ marginBottom: 18 }}>
        <div className="portal-kicker">{friendlyDate}</div>
        <h2 className="portal-title">
          {greeting},<br />
          <em>{member.firstName}.</em>
        </h2>
      </div>

      {access.state === "grace" && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            border: "1px solid var(--pt-line)",
            borderRadius: 12,
            background: "var(--pt-warn-bg, rgba(234, 179, 8, 0.10))",
            fontSize: 13,
            color: "var(--pt-ink-1)",
          }}
        >
          Tu membresía venció. Te quedan{" "}
          <strong>{access.graceDaysLeft} día{access.graceDaysLeft === 1 ? "" : "s"}</strong>{" "}
          de acceso — renueva con tu admin para no perder tu portal.
        </div>
      )}

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
            Sede {nextSession.sede === "FITNESS_CENTER" ? "Fitness Center" : "Xtreme"}
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

      {routineWeek && <RoutineWeek data={routineWeek} />}

      {activeMealPlan && (
        <section className="portal-card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <div className="portal-kicker">Tu plan de hoy</div>
            {activeMealPlan.calorieTarget && (
              <div style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
                {activeMealPlan.calorieTarget} kcal/día
              </div>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>{activeMealPlan.title}</div>
          {activeMealPlan.externalUrl && (
            <a
              href={activeMealPlan.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                marginTop: 6,
                fontSize: 13,
                color: "var(--pt-accent, var(--pt-green))",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Ver mi plan alimenticio →
            </a>
          )}
          <MealCheck
            initialFollowed={todayMealLog?.followed ?? false}
            initialFreeText={todayMealLog?.freeText ?? null}
          />
        </section>
      )}

      <section className="portal-attendance">
        <div className="head">
          <div className="t">Tu asistencia</div>
          <div className="sub">
            {attStats.lastVisit ? `Última: ${shortDate(attStats.lastVisit)}` : "Sin visitas"}
          </div>
        </div>
        <div className="grid">
          <div className="stat">
            <div className="k">Frecuencia</div>
            <div className="v">
              {attStats.weeklyFrequency.toFixed(1)}
              <span className="u">/sem</span>
            </div>
          </div>
          <div className="stat">
            <div className="k">Este mes</div>
            <div className="v">
              {attStats.thisMonth}
              <span className="u">visitas</span>
            </div>
          </div>
          <div className="stat">
            <div className="k">Total</div>
            <div className="v">
              {attendanceCount}
              <span className="u">desde inicio</span>
            </div>
          </div>
        </div>
      </section>

      {latestNote && (
        <section className="portal-note-preview">
          <div className="head">
            <div className="av">
              {(latestNote.author?.fullName ?? "L").charAt(0).toUpperCase()}
            </div>
            <div className="who">
              <div className="name">{latestNote.author?.fullName ?? "La Cueva"}</div>
              <div className="role">
                {latestNote.author?.role === "NUTRITIONIST"
                  ? "Nutricionista"
                  : latestNote.author?.role === "COACH"
                    ? "Coach"
                    : "Equipo La Cueva"}
              </div>
            </div>
            <div className="when">{shortDate(latestNote.createdAt)}</div>
          </div>
          <div className="body">{latestNote.content}</div>
        </section>
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
      <CapsuleCard now={today} />
    </PortalShell>
  );
}
