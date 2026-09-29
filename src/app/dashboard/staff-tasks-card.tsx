"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { completeStaffTask, reopenStaffTask } from "@/lib/actions/staff-tasks";
import { SEDE_LABEL, dueBucket, dueLabel, type TaskListItem } from "@/lib/tasks/meta";

const VISIBLE = 6;

/**
 * "Tareas de hoy" on the Resumen: mine plus my sede's front-desk pool, as a
 * compact checklist. The title opens the task; the box closes it (or reopens it).
 */
export function StaffTasksCard({
  tasks,
  meId,
  showSede,
  today,
}: {
  tasks: TaskListItem[];
  meId: string;
  showSede: boolean;
  today: string;
}) {
  const pending = tasks.filter((t) => t.status !== "DONE").length;
  const shown = tasks.slice(0, VISIBLE);
  const hidden = tasks.length - shown.length;

  return (
    <Card className="h-full">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2">
          Tareas de hoy
          {pending > 0 ? (
            <Badge variant="destructive" className="text-xs">{pending}</Badge>
          ) : tasks.length > 0 ? (
            <Badge variant="secondary" className="text-xs">Todo listo</Badge>
          ) : null}
          <Link href="/dashboard/tareas" className="ml-auto text-xs font-medium text-primary hover:underline">
            Ver todas →
          </Link>
        </CardTitle>
        <CardDescription>Las tuyas y las de la recepción.</CardDescription>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada pendiente para hoy.</p>
        ) : (
          <ul className="divide-y">
            {shown.map((t) => (
              <TaskRow key={t.id} task={t} meId={meId} showSede={showSede} today={today} />
            ))}
          </ul>
        )}
        {hidden > 0 && (
          <Link href="/dashboard/tareas" className="mt-2 block text-xs text-muted-foreground hover:text-foreground">
            +{hidden} más
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function TaskRow({
  task,
  meId,
  showSede,
  today,
}: {
  task: TaskListItem;
  meId: string;
  showSede: boolean;
  today: string;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [outcome, setOutcome] = useState("");
  const done = task.status === "DONE";
  // Tied to a socio or lead: closing it needs one line of what happened (it goes to their history).
  const needsOutcome = task.person !== null;

  const complete = (note: string) =>
    start(async () => {
      const res = await completeStaffTask(task.id, note);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setAsking(false);
      setOutcome("");
      router.refresh();
    });

  const reopen = () =>
    start(async () => {
      const res = await reopenStaffTask(task.id);
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });

  const toggle = () => {
    if (done) reopen();
    else if (needsOutcome) setAsking((a) => !a);
    else complete("");
  };

  const overdue = !done && dueBucket(task.dueDate, today) === "overdue";
  const who = task.assignee
    ? task.assignee.id === meId
      ? "Tú"
      : task.assignee.name.split(" ")[0]
    : showSede && task.sede
      ? `Recepción ${SEDE_LABEL[task.sede]}`
      : "Recepción";
  const href = `/dashboard/tareas?view=${task.assignee ? "mine" : "pool"}&t=${task.id}`;

  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={done || asking}
          onChange={toggle}
          disabled={isPending}
          aria-label={done ? `Reabrir «${task.title}»` : `Marcar «${task.title}» como hecha`}
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary disabled:opacity-50"
        />
        <div className="min-w-0 flex-1">
          <Link
            href={href}
            className={`block truncate text-sm font-medium hover:underline ${done ? "line-through text-muted-foreground" : ""}`}
            title={task.title}
          >
            {task.title}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {who}
            {" · "}
            <span className={overdue ? "text-destructive" : ""}>{dueLabel(task.dueDate, task.dueMinutes, today)}</span>
            {task.person && ` · ${task.person.name}`}
          </p>
        </div>
      </div>

      {asking && !done && (
        <form
          className="mt-2 ml-6.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (outcome.trim()) complete(outcome);
          }}
        >
          <Input
            autoFocus
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAsking(false);
            }}
            placeholder="¿Qué pasó? Enter para cerrar"
            className="h-8 text-sm"
            disabled={isPending}
          />
        </form>
      )}
    </li>
  );
}
