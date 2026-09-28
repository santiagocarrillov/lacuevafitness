"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NewTaskDialog, type TaskDialogBase } from "@/app/dashboard/tareas/new-task-dialog";
import {
  STATUS_LABEL,
  STATUS_TONE,
  dueBucket,
  dueLabel,
  type PersonRef,
  type TaskListItem,
} from "@/lib/tasks/meta";

/** Open tasks about this socio, the last ones closed, and "+ Tarea" with them filled in. */
export function MemberTasksCard({
  person,
  open,
  closed,
  today,
  taskDialog,
}: {
  person: PersonRef;
  open: TaskListItem[];
  closed: TaskListItem[];
  today: string;
  taskDialog: TaskDialogBase;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle>Tareas</CardTitle>
          <CardDescription>
            {open.length === 0
              ? "Nada pendiente con esta persona."
              : `${open.length} pendiente${open.length === 1 ? "" : "s"}.`}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          + Tarea
        </Button>
      </CardHeader>
      {(open.length > 0 || closed.length > 0) && (
        <CardContent className="space-y-1.5">
          {open.map((t) => (
            <TaskLine key={t.id} task={t} today={today} />
          ))}
          {closed.length > 0 && (
            <div className="pt-2 space-y-1">
              <p className="text-xs text-muted-foreground">Cerradas hace poco</p>
              {closed.map((t) => (
                <Link
                  key={t.id}
                  href={`/dashboard/tareas?t=${t.id}`}
                  className="block text-xs text-muted-foreground hover:text-foreground"
                >
                  <span className="line-through">{t.title}</span>
                  {t.outcome ? ` — ${t.outcome}` : ""}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      )}
      <NewTaskDialog
        {...taskDialog}
        open={creating}
        onOpenChange={setCreating}
        prefill={{ person }}
      />
    </Card>
  );
}

function TaskLine({ task, today }: { task: TaskListItem; today: string }) {
  const overdue = dueBucket(task.dueDate, today) === "overdue";
  return (
    <Link
      href={`/dashboard/tareas?t=${task.id}`}
      className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/60"
    >
      <span className="min-w-0 truncate">{task.title}</span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <span className={overdue ? "text-destructive" : ""}>
          {dueLabel(task.dueDate, task.dueMinutes, today)}
        </span>
        <span>{task.assignee ? task.assignee.name.split(" ")[0] : "Recepción"}</span>
        {task.status !== "TODO" && (
          <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_TONE[task.status]}`}>
            {STATUS_LABEL[task.status]}
          </span>
        )}
      </span>
    </Link>
  );
}
