"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  completeStaffTask,
  reopenStaffTask,
  type StaffTaskRow,
} from "@/lib/actions/staff-tasks";

const SEDE_LABEL = { FITNESS_CENTER: "Fitness", XTREME: "Xtreme" } as const;

export function StaffTasksCard({
  tasks,
  showSede,
}: {
  tasks: StaffTaskRow[];
  showSede: boolean;
}) {
  if (tasks.length === 0) return null;
  const pending = tasks.filter((t) => !t.done).length;

  return (
    <Card className={pending > 0 ? "border-primary/50" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          Tareas de hoy
          {pending > 0 ? (
            <Badge variant="destructive">{pending} pendiente{pending === 1 ? "" : "s"}</Badge>
          ) : (
            <Badge variant="secondary">Todo listo</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Al cerrar una tarea cuenta en una línea qué pasó: queda en el historial del lead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} showSede={showSede} />
        ))}
      </CardContent>
    </Card>
  );
}

function TaskItem({ task, showSede }: { task: StaffTaskRow; showSede: boolean }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState("");
  const [isPending, start] = useTransition();

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

  const leadHref = task.lead
    ? task.lead.conversationId
      ? `/dashboard/comunicacion?c=${task.lead.conversationId}`
      : `/dashboard/leads?q=${encodeURIComponent(task.lead.name)}`
    : null;

  return (
    <div
      className={`rounded-md border p-3 space-y-2 ${
        task.done ? "bg-muted/40 border-border" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <p className={`text-sm font-medium ${task.done ? "line-through text-muted-foreground" : ""}`}>
            {showSede && task.sede && (
              <Badge variant="outline" className="mr-2 text-[10px]">
                {SEDE_LABEL[task.sede]}
              </Badge>
            )}
            {task.title}
          </p>
          {task.detail && !task.done && (
            <p className="text-xs text-muted-foreground whitespace-pre-line">{task.detail}</p>
          )}
          {task.done && (
            <p className="text-xs text-muted-foreground">
              ✓ {task.doneByName ?? "Alguien"}: {task.outcome}
            </p>
          )}
        </div>
        {leadHref && !task.done && (
          <Link href={leadHref} className="shrink-0 text-xs font-medium text-primary hover:underline">
            {task.lead?.conversationId ? "Abrir chat ↗" : "Ver lead ↗"}
          </Link>
        )}
      </div>

      {task.done ? (
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
            placeholder="¿Qué pasó? (confirmó, no contesta, reagendó…)"
            className="h-8 text-sm"
            disabled={isPending}
          />
          <Button type="submit" size="sm" disabled={isPending || !outcome.trim()}>
            {isPending ? "Guardando…" : "Hecho"}
          </Button>
        </form>
      )}
    </div>
  );
}
