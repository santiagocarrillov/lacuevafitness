import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Sede, type User } from "@/generated/prisma/client";
import { getTodaySchedules, getActiveMembers } from "@/lib/actions/attendance";
import { ecuadorTimeOfDayMinutes, isAttendanceWindowOpen } from "@/lib/timezone";
import { requireAuth, getSedeScope } from "@/lib/auth";
import {
  currentWeekMonday,
  ecuadorTodayIso,
  loadAttendanceWeek,
  resolveSedeFilter,
  resolveWeekMonday,
  shiftWeek,
  weekRangeLabel,
  type CalendarSedeFilter,
} from "@/lib/attendance-calendar";
import { ScheduleList } from "./schedule-list";
import { AttendanceCalendar } from "./attendance-calendar";

export const dynamic = "force-dynamic";

export default async function AsistenciaPage({
  searchParams,
}: {
  searchParams: Promise<{
    horario?: string;
    vista?: string;
    semana?: string;
    sede?: string;
    domingo?: string;
  }>;
}) {
  const params = await searchParams;
  const { horario } = params;
  const user = await requireAuth();

  if (params.vista === "calendario") {
    return <CalendarioView user={user} params={params} />;
  }

  const scopedSede = getSedeScope(user);
  const isCoach = user.role === "COACH";
  const windowOpen = isAttendanceWindowOpen();

  // Which sedes to show: if user is scoped, only their sede; otherwise both.
  const showFC = !scopedSede || scopedSede === "FITNESS_CENTER";
  const showXT = !scopedSede || scopedSede === "XTREME";

  const [schedulesFC, schedulesXT, membersFC, membersXT] = await Promise.all([
    showFC ? getTodaySchedules(Sede.FITNESS_CENTER) : Promise.resolve([]),
    showXT ? getTodaySchedules(Sede.XTREME) : Promise.resolve([]),
    showFC ? getActiveMembers(Sede.FITNESS_CENTER) : Promise.resolve([]),
    showXT ? getActiveMembers(Sede.XTREME) : Promise.resolve([]),
  ]);

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Asistencia</h1>
        <p className="text-sm text-muted-foreground">
          {isCoach
            ? "Confirma el conteo de alumnos al final de cada clase."
            : "Selecciona un horario, registra alumnos, y el coach confirma al final."}
        </p>
      </header>

      <ViewToggle active="tomar" />

      {!windowOpen && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          🔒 <strong>Ventana de registro cerrada.</strong> No se pueden ingresar nuevas asistencias después de las 9:30pm. El siguiente día empieza a las 12:00 AM.
        </div>
      )}

      <div className="space-y-8">
        {showFC && (
          <section>
            <h2 className="text-lg font-medium mb-3">La Cueva Fitness Center</h2>
            <ScheduleList
              schedules={schedulesFC}
              members={membersFC}
              sede="FITNESS_CENTER"
              userRole={user.role}
              windowOpen={windowOpen}
              initialScheduleId={horario ?? null}
            />
          </section>
        )}

        {showXT && (
          <section>
            <h2 className="text-lg font-medium mb-3">La Cueva Xtreme</h2>
            <ScheduleList
              schedules={schedulesXT}
              members={membersXT}
              sede="XTREME"
              userRole={user.role}
              windowOpen={windowOpen}
              initialScheduleId={horario ?? null}
            />
          </section>
        )}
      </div>
    </div>
  );
}

// ── View toggle + calendar view ─────────────────────────────────────

function ViewToggle({ active }: { active: "tomar" | "calendario" }) {
  const tabs = [
    { key: "tomar", label: "Tomar asistencia", href: "/dashboard/asistencia" },
    { key: "calendario", label: "Calendario", href: "/dashboard/asistencia?vista=calendario" },
  ] as const;
  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-sm">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            active === t.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

const SEDE_OPTIONS: { key: CalendarSedeFilter; label: string }[] = [
  { key: "AMBAS", label: "Ambas" },
  { key: "FITNESS_CENTER", label: "Fitness Center" },
  { key: "XTREME", label: "Xtreme" },
];

async function CalendarioView({
  user,
  params,
}: {
  user: User;
  params: { semana?: string; sede?: string; domingo?: string };
}) {
  const scopedSede = getSedeScope(user);
  const monday = resolveWeekMonday(params.semana);
  const sede = resolveSedeFilter(user, params.sede);
  const showSunday = params.domingo === "1";
  const week = await loadAttendanceWeek(user, monday, sede);

  const mondayIso = week.monday;
  const href = (over: { semana?: string; sede?: CalendarSedeFilter; domingo?: boolean }) => {
    const q = new URLSearchParams({ vista: "calendario" });
    const semana = over.semana ?? mondayIso;
    if (semana !== currentWeekMonday()) q.set("semana", semana);
    const s = over.sede ?? sede;
    if (!scopedSede && s !== "AMBAS") q.set("sede", s);
    if (over.domingo ?? showSunday) q.set("domingo", "1");
    return `/dashboard/asistencia?${q.toString()}`;
  };

  const sundaySessions = week.sessions.filter((s) => s.dayIndex === 6).length;
  const totalAttendance = week.sessions
    .filter((s) => showSunday || s.dayIndex !== 6)
    .reduce((n, s) => n + s.attendees.length, 0);
  const isCurrentWeek = mondayIso === currentWeekMonday();

  return (
    <div className="p-4 sm:p-8 space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Asistencia</h1>
        <p className="text-sm text-muted-foreground">
          Calendario semanal de clases. Toca una clase para ver quién vino.
        </p>
      </header>

      <ViewToggle active="calendario" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-border bg-card shadow-sm">
            <Link
              href={href({ semana: shiftWeek(monday, -1) })}
              aria-label="Semana anterior"
              className="rounded-l-lg px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <Link
              href={href({ semana: currentWeekMonday() })}
              aria-current={isCurrentWeek ? "date" : undefined}
              className={`border-x border-border px-3 py-1.5 text-sm hover:bg-accent ${
                isCurrentWeek ? "font-medium" : ""
              }`}
            >
              Hoy
            </Link>
            <Link
              href={href({ semana: shiftWeek(monday, 1) })}
              aria-label="Semana siguiente"
              className="rounded-r-lg px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div>
            <p className="text-base font-semibold leading-tight">
              {weekRangeLabel(monday, showSunday ? 7 : 6)}
            </p>
            <p className="text-xs text-muted-foreground">
              {totalAttendance === 1 ? "1 asistencia" : `${totalAttendance} asistencias`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {scopedSede ? (
            <span className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
              {scopedSede === "FITNESS_CENTER" ? "Fitness Center" : "Xtreme"}
            </span>
          ) : (
            <div className="inline-flex gap-1">
              {SEDE_OPTIONS.map((o) => (
                <Link
                  key={o.key}
                  href={href({ sede: o.key })}
                  aria-current={sede === o.key ? "true" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition ${
                    sede === o.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-accent"
                  }`}
                >
                  {o.key !== "AMBAS" && (
                    <span
                      className={`h-2 w-2 rounded-sm ${
                        o.key === "FITNESS_CENTER" ? "bg-chart-2" : "bg-chart-4"
                      }`}
                    />
                  )}
                  {o.label}
                </Link>
              ))}
            </div>
          )}
          <Link
            href={href({ domingo: !showSunday })}
            className="rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-accent"
          >
            {showSunday ? "Ocultar domingo" : "Mostrar domingo"}
            {!showSunday && sundaySessions > 0 ? ` (${sundaySessions})` : ""}
          </Link>
        </div>
      </div>

      <AttendanceCalendar
        days={week.days}
        sessions={week.sessions}
        showSunday={showSunday}
        showSedeTag={sede === "AMBAS"}
        todayIso={ecuadorTodayIso()}
        nowMin={ecuadorTimeOfDayMinutes()}
      />
    </div>
  );
}
