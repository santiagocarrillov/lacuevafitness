import Link from "next/link";
import { STATUS_LABEL, STATUS_TONE, dueBucket, dueLabel, type PersonRef, type TaskListItem } from "@/lib/tasks/meta";

/** Link "+ Tarea" con la persona ya puesta, que regresa a la ficha. */
export function newTaskHref(person: PersonRef, back: string) {
  return `/dashboard/tareas/nueva?${person.kind === "member" ? "socio" : "lead"}=${person.id}&volver=${encodeURIComponent(back)}`;
}

/** Tareas abiertas con esta persona, compactas para la columna derecha. */
export function PersonTasks({ open, today }: { open: TaskListItem[]; today: string }) {
  if (open.length === 0) return <p className="text-xs text-muted-foreground">Nada pendiente con esta persona.</p>;
  return (
    <ul className="space-y-1.5">
      {open.map((t) => {
        const overdue = dueBucket(t.dueDate, today) === "overdue";
        return (
          <li key={t.id}>
            <Link href={`/dashboard/tareas?t=${t.id}`} className="block rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm hover:bg-muted/60">
              <span className="block truncate font-medium">{t.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className={overdue ? "font-medium text-destructive" : ""}>{dueLabel(t.dueDate, t.dueMinutes, today)}</span>
                <span>· {t.assignee ? t.assignee.name.split(" ")[0] : "Recepción"}</span>
                {t.status !== "TODO" && (
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
