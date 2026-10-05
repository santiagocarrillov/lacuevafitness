"use client";

import type { TaskListItem } from "@/lib/tasks/meta";
import { TaskCheckRow } from "./task-check-row";

/**
 * A person's tasks where you are talking to them: what's open (closable right
 * here) and the last ones done, so you know what already happened.
 */
export function PersonTaskList({
  open,
  closed,
  meId,
  today,
  onChanged,
  closedShown = 3,
}: {
  open: TaskListItem[];
  closed: TaskListItem[];
  meId: string;
  today: string;
  onChanged?: () => void;
  closedShown?: number;
}) {
  const recent = closed.slice(0, closedShown);
  return (
    <div className="space-y-2">
      {open.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nada pendiente con esta persona.</p>
      ) : (
        <ul className="divide-y">
          {open.map((t) => (
            <TaskCheckRow key={t.id} task={t} meId={meId} showSede={false} showPerson={false} today={today} onChanged={onChanged} />
          ))}
        </ul>
      )}
      {recent.length > 0 && (
        <details className="group/done">
          <summary className="cursor-pointer list-none text-[11px] font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            Hechas hace poco ({recent.length}) <span className="group-open/done:hidden">▸</span>
            <span className="hidden group-open/done:inline">▾</span>
          </summary>
          <ul className="mt-1.5 divide-y">
            {recent.map((t) => (
              <TaskCheckRow key={t.id} task={t} meId={meId} showSede={false} showPerson={false} today={today} onChanged={onChanged} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
