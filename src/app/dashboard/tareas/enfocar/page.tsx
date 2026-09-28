import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { ecuadorDateString } from "@/lib/timezone";
import { getAvailableViews, getFocusQueue } from "@/lib/actions/staff-tasks";
import { VIEW_LABEL, type TaskView } from "@/lib/tasks/meta";
import { FocusRunner } from "./focus-runner";

export const dynamic = "force-dynamic";

/**
 * HubSpot's "Start tasks": the tasks due today (and overdue) of one tab, one
 * at a time, with the person and their WhatsApp next to each.
 */
export default async function EnfocarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const user = await requireAuth();
  if (user.role === "MEMBER") redirect("/portal/hoy");

  const views = await getAvailableViews();
  const view: TaskView = views.includes(params.view as TaskView)
    ? (params.view as TaskView)
    : "mine";
  const queue = await getFocusQueue(view);

  if (queue.length === 0) {
    return (
      <div className="p-8 space-y-3">
        <h1 className="text-lg font-semibold">Nada para enfocar</h1>
        <p className="text-sm text-muted-foreground">
          No hay tareas de hoy ni vencidas en «{VIEW_LABEL[view]}».
        </p>
        <Link href={`/dashboard/tareas?view=${view}`} className="text-sm text-primary hover:underline">
          ← Volver a Tareas
        </Link>
      </div>
    );
  }

  return (
    <FocusRunner
      queue={queue}
      view={view}
      viewLabel={VIEW_LABEL[view]}
      today={ecuadorDateString()}
      canInbox={can.manageLeads(user)}
    />
  );
}
