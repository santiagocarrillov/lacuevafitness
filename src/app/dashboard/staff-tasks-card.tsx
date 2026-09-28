"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeStaffTask, reopenStaffTask } from "@/lib/actions/staff-tasks";
import { SEDE_LABEL, dueBucket, dueLabel, type TaskListItem } from "@/lib/tasks/meta";

/** "Mis tareas de hoy" on the Resumen: mine plus my sede's front-desk pool. */
export function StaffTasksCard({
  tasks,
  showSede,
  today,
}: {
  tasks: TaskListItem[];
  showSede: boolean;
  today: string;
}) {
  if (tasks.length === 0) return null;
  const pending = tasks.filter((t) => t.status !== "DONE").length;

  return (
    <Card className={pending > 0 ? "border-primary/50" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          Mis tareas de hoy
          {pending > 0 ? (
            <Badge variant="destructive">{pending} pendiente{pending === 1 ? "" : "s"}</Badge>
          ) : (
            <Badge variant="secondary">Todo listo</Badge>
          )}
          <Link href="/dashboard/tareas" className="ml-auto text-xs font-medium text-primary hover:underline">
            Ver todas →
          </Link>
        </CardTitle>
        <CardDescription>
          Las tuyas y las de la recepción. Al cerrar una con socio o lead, cuenta en una línea qué pasó: queda en su historial.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} showSede={showSede} today={today} />
        ))}
      </CardContent>
    </Card>
  );
}

function TaskItem({ task, showSede, today }: { task: TaskListItem; showSede: boolean; today: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState("");
  const [isPending, start] = useTransition();
  const done = task.status === "DONE";
  const needsOutcome = task.person !== null;

  const complete = () =>
    start(async () => {
      const res = await completeStaffTask(task.id, outcome);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tarea cerrada.");
      setOutcome("");
      router.refresh();
    });

  const reopen = () =>
    start(async () => {
      const res = await reopenStaffTask(task.id);
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });

  const overdue = dueBucket(task.dueDate, today) === "overdue";

  return (
    <div className={`rounded-md border p-3 space-y-2 ${done ? "bg-muted/40 border-border" : "border-border"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>
            {showSede && task.sede && !task.assignee && (
              <Badge variant="outline" className="mr-2 text-[10px]">
                {SEDE_LABEL[task.sede]}
              </Badge>
            )}
            {task.title}
          </p>
          {done ? (
            <p className="text-xs text-muted-foreground">
              ✓ {task.doneByName ?? "Alguien"}
              {task.outcome ? `: ${task.outcome}` : ""}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              <span className={overdue ? "text-destructive" : ""}>
                {dueLabel(task.dueDate, task.dueMinutes, today)}
              </span>
              {task.person && ` · ${task.person.name}`}
              {!task.assignee && " · Recepción"}
            </p>
          )}
        </div>
        {!done && (
          <Link
            href={`/dashboard/tareas?view=${task.assignee ? "mine" : "pool"}&t=${task.id}`}
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Abrir ↗
          </Link>
        )}
      </div>

      {done ? (
        <button
          type="button"
          onClick={reopen}
          disabled={isPending}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          deshacer
        </button>
      ) : (
        <form
          className="flex flex-col sm:flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            complete();
          }}
        >
          <Input
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder={needsOutcome ? "¿Qué pasó? (confirmó, no contesta, reagendó…)" : "¿Qué pasó? (opcional)"}
            className="h-8 text-sm"
            disabled={isPending}
          />
          <Button type="submit" size="sm" disabled={isPending || (needsOutcome && !outcome.trim())}>
            {isPending ? "Guardando…" : "Hecho"}
          </Button>
        </form>
      )}
    </div>
  );
}
