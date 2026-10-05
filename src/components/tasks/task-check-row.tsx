"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { completeStaffTask, reopenStaffTask } from "@/lib/actions/staff-tasks";
import { SEDE_LABEL, STATUS_LABEL, STATUS_TONE, dueBucket, dueLabel, type TaskListItem } from "@/lib/tasks/meta";

/**
 * One task as a checklist line: the title opens it, the box closes it (or
 * reopens it). Tied to a socio or lead, closing asks one line of "¿Qué pasó?"
 * that lands in their history. `onChanged` defaults to refreshing the page.
 */
export function TaskCheckRow({
  task,
  meId,
  showSede,
  showPerson = true,
  today,
  onChanged,
}: {
  task: TaskListItem;
  meId: string;
  showSede: boolean;
  /** Off inside a person's own ficha/chat, where the name is redundant. */
  showPerson?: boolean;
  today: string;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [outcome, setOutcome] = useState("");
  const done = task.status === "DONE";
  // Tied to a socio or lead: closing it needs one line of what happened (it goes to their history).
  const needsOutcome = task.person !== null;
  const changed = onChanged ?? (() => router.refresh());

  const complete = (note: string) =>
    start(async () => {
      const res = await completeStaffTask(task.id, note);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setAsking(false);
      setOutcome("");
      changed();
    });

  const reopen = () =>
    start(async () => {
      const res = await reopenStaffTask(task.id);
      if (!res.ok) toast.error(res.error);
      else changed();
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
            {showPerson && task.person && ` · ${task.person.name}`}
            {!done && task.status !== "TODO" && (
              <span className={`ml-1.5 rounded px-1 py-px text-[10px] ${STATUS_TONE[task.status]}`}>{STATUS_LABEL[task.status]}</span>
            )}
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
