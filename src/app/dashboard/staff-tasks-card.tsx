"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskCheckRow } from "@/components/tasks/task-check-row";
import type { TaskListItem } from "@/lib/tasks/meta";

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
              <TaskCheckRow key={t.id} task={t} meId={meId} showSede={showSede} today={today} />
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
