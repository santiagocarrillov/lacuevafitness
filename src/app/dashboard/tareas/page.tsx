import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { ecuadorDateString } from "@/lib/timezone";
import {
  countOpenTasks,
  getAssignableUsers,
  getAvailableViews,
  getTaskDetail,
  listTasks,
} from "@/lib/actions/staff-tasks";
import { VIEW_LABEL, SEDE_LABEL, dueBucket, type TaskView } from "@/lib/tasks/meta";
import { TaskList } from "./task-list";
import { TaskPanel } from "./task-panel";

export const dynamic = "force-dynamic";

export default async function TareasPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; t?: string; closed?: string }>;
}) {
  const params = await searchParams;
  const user = await requireAuth();
  if (user.role === "MEMBER") redirect("/portal/hoy");

  const views = await getAvailableViews();
  const view: TaskView = views.includes(params.view as TaskView)
    ? (params.view as TaskView)
    : "mine";
  const closed = params.closed === "1";

  const [tasks, counts, users, selected] = await Promise.all([
    listTasks(view, closed),
    countOpenTasks(),
    getAssignableUsers(),
    params.t ? getTaskDetail(params.t) : Promise.resolve(null),
  ]);

  const base = `view=${view}${closed ? "&closed=1" : ""}`;
  const today = ecuadorDateString();
  // Same rule as the focus queue: open and due today or earlier.
  const focusCount = closed
    ? 0
    : tasks.filter((t) => {
        const b = dueBucket(t.dueDate, today);
        return b === "overdue" || b === "today";
      }).length;
  const poolLabel =
    user.role === "ADMIN" && user.sede ? `Recepción ${SEDE_LABEL[user.sede]}` : VIEW_LABEL.pool;

  return (
    <div className="h-[calc(100vh-3rem)] md:h-screen flex flex-col">
      <header className="px-4 md:px-6 py-3 border-b border-border shrink-0 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Tareas</h1>
            <p className="text-xs text-muted-foreground">
              Asigna, sigue y cierra pendientes del equipo. Lo que cierres con una persona asociada queda en su historial.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
          {focusCount > 0 && (
            <Link
              href={`/dashboard/tareas/enfocar?view=${view}`}
              className="inline-flex items-center justify-center rounded-lg border border-primary/50 text-sm font-medium h-8 px-3 hover:bg-primary/10"
              title="Recorre las tareas de hoy una por una, con la persona y su WhatsApp al lado"
            >
              Enfocar ({focusCount})
            </Link>
          )}
          <Link
            href={`/dashboard/tareas/nueva?volver=${encodeURIComponent(`/dashboard/tareas?${base}`)}`}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-medium h-8 px-3 hover:bg-primary/90"
          >
            + Nueva tarea
          </Link>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-1.5 text-sm">
          {views.map((v) => (
            <Link
              key={v}
              href={`/dashboard/tareas?view=${v}${closed ? "&closed=1" : ""}`}
              className={`rounded-md px-2.5 py-1 transition ${
                v === view ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground"
              }`}
            >
              {v === "pool" ? poolLabel : VIEW_LABEL[v]}
              {counts[v] ? <span className="ml-1.5 text-xs opacity-80">{counts[v]}</span> : null}
            </Link>
          ))}
          <Link
            href={`/dashboard/tareas?view=${view}${closed ? "" : "&closed=1"}`}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            {closed ? "← Ver abiertas" : "Ver cerradas (14 días)"}
          </Link>
        </nav>
      </header>

      <div className="flex-1 min-h-0 grid md:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <section
          className={`min-h-0 overflow-y-auto border-r border-border ${params.t ? "hidden md:block" : ""}`}
        >
          <TaskList
            tasks={tasks}
            today={today}
            selectedId={selected?.id ?? null}
            baseQuery={base}
            closed={closed}
            showAssignee={view !== "mine"}
          />
        </section>
        <section className={`min-h-0 overflow-y-auto ${params.t ? "" : "hidden md:block"}`}>
          {selected ? (
            <TaskPanel
              key={selected.id}
              task={selected}
              users={users}
              today={today}
              currentUserId={user.id}
              canPool={can.manageLeads(user)}
              baseQuery={base}
            />
          ) : params.t ? (
            <p className="p-8 text-sm text-muted-foreground">
              Esa tarea ya no existe o no la puedes ver.
            </p>
          ) : (
            <p className="p-8 text-sm text-muted-foreground">Elige una tarea para verla aquí.</p>
          )}
        </section>
      </div>
    </div>
  );
}
