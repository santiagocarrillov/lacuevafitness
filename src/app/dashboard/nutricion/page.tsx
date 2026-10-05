import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, CalendarPlus, CheckSquare, Clock, PieChart, Salad, Users } from "lucide-react";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAgenda, getNutritionCoverage } from "@/lib/actions/nutrition-appointments";
import { getToSchedule } from "@/lib/actions/nutrition-booking";
import { loadSlots } from "@/lib/nutrition/booking-core";
import { APPOINTMENT_KIND_LABEL, APPOINTMENT_STATUS_LABEL, addDays, ecuadorTimeString } from "@/lib/nutrition/appointments";
import { COVERAGE_LABEL, type CoverageState } from "@/lib/nutrition/appointments";
import { ecuadorDateString } from "@/lib/timezone";
import { ApptStatusButtons, NewTaskInline, QuickCalculator, ToScheduleActions } from "./home-widgets";
import { getAssignableUsers } from "@/lib/actions/staff-tasks";

export const dynamic = "force-dynamic";

const GREEN = "#2f855a";
const SEDE_SHORT: Record<string, string> = { FITNESS_CENTER: "Fitness", XTREME: "Xtreme" };

function Card({ title, count, icon: Icon, aside, children }: { title: string; count?: number; icon: typeof Users; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <header className="flex items-center justify-between gap-2 border-t-2 px-4 py-3" style={{ borderTopColor: GREEN }}>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: GREEN }}>
          <Icon className="size-4" /> {title}
          {count !== undefined && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">{count}</span>}
        </h2>
        {aside && <div className="text-xs">{aside}</div>}
      </header>
      <div className="border-t border-stone-100">{children}</div>
    </section>
  );
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
const AVATAR = ["#0f9f8f", "#d97e0a", "#6b4fb5", "#3a8fd1", "#e5533f"];
const avatarColor = (id: string) => AVATAR[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];

function Avatar({ id, name }: { id: string; name: string }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: avatarColor(id) }}>
      {initials(name)}
    </span>
  );
}

const dayHeader = (date: string, today: string) => {
  const label = new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return date === today ? `Hoy · ${label}` : date === addDays(today, 1) ? `Mañana · ${label}` : label;
};

export default async function NutricionHomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAuth();
  const sp = await searchParams;
  // Old agenda links (?fecha=, ?vista=, ?nuevo=) now live under /agenda.
  if (sp.fecha || sp.vista || sp.nuevo || sp.sede) {
    const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1]));
    redirect(`/dashboard/nutricion/agenda?${q}`);
  }
  const today = ecuadorDateString();
  const scope = getSedeScope(user);
  const clinical = can.manageNutrition(user);

  const [appts, toSchedule, coverage, tasks, slots, hasHours, taskUsers] = await Promise.all([
    getAgenda(today, addDays(today, 6), scope),
    getToSchedule(),
    getNutritionCoverage(scope),
    prisma.staffTask.findMany({
      where: { assigneeId: user.id, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, parentId: null },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
      take: 8,
      select: { id: true, title: true, dueDate: true, member: { select: { firstName: true, lastName: true } } },
    }),
    loadSlots(prisma, { days: 7, sede: scope }),
    prisma.nutritionAvailability.count({ where: { active: true } }),
    getAssignableUsers(),
  ]);
  const taskBase = { users: taskUsers, currentUserId: user.id, canPool: can.manageLeads(user), defaultSede: user.sede };
  const scheduled = appts.filter((a) => a.status !== "CANCELLED");
  const byDay = new Map<string, typeof scheduled>();
  for (const a of scheduled) {
    const d = ecuadorDateString(a.startsAt);
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }
  const counts = coverage.reduce((acc, r) => ({ ...acc, [r.state]: (acc[r.state] ?? 0) + 1 }), {} as Record<CoverageState, number>);
  const total = coverage.length || 1;
  const openSlots = slots.reduce((n, d) => n + d.slots.length, 0);
  const urgent = toSchedule.filter((t) => t.daysLeft <= 1).length;

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      {/* Left: coverage, calculator, diets */}
      <div className="space-y-5 lg:col-span-3">
        <Card title="Cobertura" icon={PieChart} aside={<Link href="/dashboard/nutricion/cobertura" className="text-primary hover:underline">Ver</Link>}>
          <div className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">{coverage.length} socios activos y en evaluación</p>
            <div className="flex h-3 overflow-hidden rounded-full bg-stone-100">
              {(["ok", "scheduled", "overdue", "never"] as CoverageState[]).map((s) => (
                <div key={s} style={{ width: `${((counts[s] ?? 0) / total) * 100}%`, backgroundColor: { ok: "#2f855a", scheduled: "#3a8fd1", overdue: "#d97e0a", never: "#e5533f" }[s] }} />
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-2 text-xs">
              {(["ok", "scheduled", "overdue", "never"] as CoverageState[]).map((s) => (
                <li key={s}>
                  <Link href={`/dashboard/nutricion/cobertura?filtro=${s}`} className="block rounded-lg bg-stone-50 px-2 py-1.5 hover:bg-stone-100">
                    <span className="block text-base font-semibold tabular-nums">{counts[s] ?? 0}</span>
                    {COVERAGE_LABEL[s]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {clinical && (
          <Card title="Calculadora rápida" icon={Clock} aside={<Link href="/dashboard/nutricion/calculadora" className="text-primary hover:underline">Completa</Link>}>
            <QuickCalculator />
          </Card>
        )}

        {clinical && (
          <Card title="Armar dieta" icon={Salad}>
            <div className="space-y-2 p-4 text-sm">
              <Link href="/dashboard/nutricion/planes/socio/nuevo?consulta=1" className="block rounded-lg border border-[#2f855a]/40 bg-[#2f855a]/5 px-3 py-2.5 font-medium hover:border-[#2f855a]">
                Consulta en vivo
                <span className="block text-xs font-normal text-muted-foreground">Con el socio presente: su día tipo, kcal y macros a la vista</span>
              </Link>
              <Link href="/dashboard/nutricion/planes/socio/nuevo" className="block rounded-lg border px-3 py-2.5 font-medium hover:border-stone-400">
                Plan para un socio
                <span className="block text-xs font-normal text-muted-foreground">Desde cero o desde un plan base, en el editor completo</span>
              </Link>
              <Link href="/dashboard/nutricion/planes/plantilla/nueva" className="block rounded-lg border px-3 py-2.5 font-medium hover:border-stone-400">
                Nuevo plan base
                <span className="block text-xs font-normal text-muted-foreground">Plantilla por nivel de calorías</span>
              </Link>
              <Link href="/dashboard/nutricion/planes" className="block px-1 text-xs text-primary hover:underline">Ver todos los planes →</Link>
            </div>
          </Card>
        )}
      </div>

      {/* Center: upcoming sessions */}
      <div className="lg:col-span-5">
        <Card
          title="Próximas sesiones"
          icon={CalendarClock}
          count={scheduled.filter((a) => a.status === "SCHEDULED").length}
          aside={
            <span className="flex items-center gap-3">
              <Link href="/dashboard/nutricion/agenda?vista=semana" className="text-primary hover:underline">Semana</Link>
              <Link href="/dashboard/nutricion/citas/nueva" className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium text-white" style={{ backgroundColor: GREEN }}>
                <CalendarPlus className="size-3.5" /> Agendar
              </Link>
            </span>
          }
        >
          {byDay.size === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Sin citas en los próximos 7 días.</p>
          ) : (
            [...byDay.entries()].map(([day, list]) => (
              <div key={day}>
                <p className="bg-stone-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500 first-letter:uppercase">{dayHeader(day, today)}</p>
                <ul className="divide-y">
                  {list.map((a) => {
                    const name = `${a.member.firstName} ${a.member.lastName}`.trim();
                    return (
                      <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className={`h-9 w-1 shrink-0 rounded-full ${a.status === "ATTENDED" ? "bg-emerald-500" : a.status === "NO_SHOW" ? "bg-red-400" : a.kind === "INITIAL" ? "bg-amber-400" : "bg-sky-400"}`} />
                        <Avatar id={a.member.id} name={name} />
                        <Link href={`/dashboard/nutricion/citas/${a.id}`} className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold hover:underline">{name} · {ecuadorTimeString(a.startsAt)}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {APPOINTMENT_KIND_LABEL[a.kind]} · {SEDE_SHORT[a.sede]}
                            {a.status !== "SCHEDULED" && ` · ${APPOINTMENT_STATUS_LABEL[a.status]}`}
                          </p>
                        </Link>
                        {a.status === "SCHEDULED" && <ApptStatusButtons id={a.id} />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            {hasHours ? (
              <>
                {openSlots} horarios libres esta semana ·{" "}
                <Link href="/dashboard/nutricion/horarios" className="text-primary hover:underline">Horarios</Link>
              </>
            ) : (
              <Link href="/dashboard/nutricion/horarios" className="font-medium text-amber-700 hover:underline">
                Configura tus horarios para que los socios agenden solos →
              </Link>
            )}
          </div>
        </Card>
      </div>

      {/* Right: to schedule + tasks */}
      <div className="space-y-5 lg:col-span-4">
        <Card title="Por agendar" icon={Users} count={toSchedule.length} aside={urgent ? <span className="font-medium text-red-700">{urgent} urgentes</span> : null}>
          {toSchedule.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nadie pendiente: todos los trials y controles tienen cita.</p>
          ) : (
            <ul className="max-h-[32rem] divide-y overflow-y-auto">
              {toSchedule.map((t) => (
                <li key={`${t.reason}-${t.memberId}`} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <Avatar id={t.memberId} name={t.name} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/dashboard/socios/${t.memberId}`} className="block truncate text-sm font-semibold hover:underline">{t.name}</Link>
                      <p className="text-xs text-muted-foreground">
                        <span className={`mr-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.reason === "TRIAL" ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-900"}`}>
                          {t.reason === "TRIAL" ? "TRIAL $9" : "MEDICIÓN"}
                        </span>
                        {t.detail} · {SEDE_SHORT[t.sede]}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${t.daysLeft < 0 ? "bg-red-600 text-white" : t.daysLeft <= 1 ? "bg-red-50 text-red-800" : t.daysLeft <= 3 ? "bg-amber-50 text-amber-800" : "bg-stone-100 text-stone-700"}`}>
                      {t.daysLeft < 0 ? `Venció hace ${-t.daysLeft} d` : t.daysLeft === 0 ? "Hoy" : t.daysLeft === 1 ? "Mañana" : `Hasta ${t.deadline.slice(8)}/${t.deadline.slice(5, 7)}`}
                    </span>
                  </div>
                  <ToScheduleActions memberId={t.memberId} name={t.name} taskBase={taskBase} reason={t.reason} deadline={t.reason === "TRIAL" ? t.deadline : null} sent={!!t.invite} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Mis tareas" icon={CheckSquare} count={tasks.length} aside={<Link href="/dashboard/tareas" className="text-primary hover:underline">Todas</Link>}>
          <NewTaskInline base={taskBase} />
          {tasks.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Sin tareas pendientes.</p>
          ) : (
            <ul className="divide-y">
              {tasks.map((t) => (
                <li key={t.id}>
                  <Link href={`/dashboard/tareas?t=${t.id}`} className="block px-4 py-2.5 hover:bg-stone-50">
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.member ? `${t.member.firstName} ${t.member.lastName} · ` : ""}
                      {t.dueDate ? `Vence ${t.dueDate.toISOString().slice(0, 10)}` : "Sin fecha"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
