import Link from "next/link";
import { CornerDownRight, ListChecks, MessageCircle, Phone, User } from "lucide-react";
import {
  STATUS_LABEL,
  STATUS_TONE,
  dueBucket,
  dueLabel,
  type DueBucket,
  type TaskListItem,
} from "@/lib/tasks/meta";

const BUCKETS: { key: DueBucket; label: string; tone: string }[] = [
  { key: "overdue", label: "Vencidas", tone: "text-destructive" },
  { key: "today", label: "Hoy", tone: "text-foreground" },
  { key: "upcoming", label: "Próximas", tone: "text-muted-foreground" },
  { key: "undated", label: "Sin fecha", tone: "text-muted-foreground" },
];

export function TaskList({
  tasks,
  today,
  selectedId,
  baseQuery,
  closed,
  showAssignee,
}: {
  tasks: TaskListItem[];
  today: string;
  selectedId: string | null;
  baseQuery: string;
  closed: boolean;
  showAssignee: boolean;
}) {
  if (tasks.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        {closed ? "Nada cerrado en los últimos 14 días." : "Sin tareas pendientes aquí."}
      </p>
    );
  }

  if (closed) {
    return (
      <ul>
        {tasks.map((t) => (
          <Row key={t.id} task={t} today={today} selected={t.id === selectedId} baseQuery={baseQuery} showAssignee />
        ))}
      </ul>
    );
  }

  return (
    <div>
      {BUCKETS.map((b) => {
        const rows = tasks.filter((t) => dueBucket(t.dueDate, today) === b.key);
        if (rows.length === 0) return null;
        return (
          <div key={b.key}>
            <p className={`px-4 pt-4 pb-1 text-xs font-medium ${b.tone}`}>
              {b.label} <span className="text-muted-foreground">· {rows.length}</span>
            </p>
            <ul>
              {rows.map((t) => (
                <Row
                  key={t.id}
                  task={t}
                  today={today}
                  selected={t.id === selectedId}
                  baseQuery={baseQuery}
                  showAssignee={showAssignee}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Row({
  task,
  today,
  selected,
  baseQuery,
  showAssignee,
}: {
  task: TaskListItem;
  today: string;
  selected: boolean;
  baseQuery: string;
  showAssignee: boolean;
}) {
  const overdue = dueBucket(task.dueDate, today) === "overdue" && task.status !== "DONE";
  const TypeIcon = task.type === "CALL" ? Phone : task.type === "WHATSAPP" ? MessageCircle : null;

  return (
    <li>
      <Link
        href={`/dashboard/tareas?${baseQuery}&t=${task.id}`}
        className={`block border-b border-border px-4 py-2.5 transition ${
          selected ? "bg-primary/10" : "hover:bg-accent/60"
        }`}
      >
        {task.parentTitle && (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
            <CornerDownRight className="size-3 shrink-0" /> {task.parentTitle}
          </p>
        )}
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-sm font-medium leading-snug ${
              task.status === "DONE" || task.status === "CANCELED" ? "line-through text-muted-foreground" : ""
            }`}
          >
            {task.priority > 0 && <span className="mr-1 text-destructive" title="Prioridad alta">!</span>}
            {task.title}
          </p>
          {TypeIcon && <TypeIcon className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className={overdue ? "text-destructive" : ""}>
            {dueLabel(task.dueDate, task.dueMinutes, today)}
          </span>
          {task.person && (
            <span className="inline-flex items-center gap-1 truncate max-w-[12rem]">
              <User className="size-3 shrink-0" />
              {task.person.name}
            </span>
          )}
          {task.subtaskCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks className="size-3" />
              {task.subtaskDone}/{task.subtaskCount}
            </span>
          )}
          {showAssignee && (
            <span className="truncate">{task.assignee ? task.assignee.name : "Sin responsable"}</span>
          )}
          {task.status !== "TODO" && (
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_TONE[task.status]}`}>
              {STATUS_LABEL[task.status]}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
