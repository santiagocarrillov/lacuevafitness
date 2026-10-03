import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getAssignableUsers } from "@/lib/actions/staff-tasks";
import { FormPage } from "@/app/dashboard/form-page";
import { safeBack } from "@/lib/safe-back";
import { NewTaskForm } from "../new-task-form";
import { resolveTaskPrefill, type TaskPrefillParams } from "./prefill";

export const dynamic = "force-dynamic";

export default async function NuevaTareaPage({
  searchParams,
}: {
  searchParams: Promise<TaskPrefillParams & { volver?: string }>;
}) {
  const user = await requireAuth();
  if (user.role === "MEMBER") redirect("/portal/hoy");
  const { volver, ...params } = await searchParams;

  const [users, prefill] = await Promise.all([getAssignableUsers(), resolveTaskPrefill(user, params)]);
  const back = safeBack(volver, "/dashboard/tareas");
  // Coming from the task list: land on the new task, as the old popup did.
  const openCreated = back === "/dashboard/tareas" || back.startsWith("/dashboard/tareas?");

  return (
    <FormPage title="Nueva tarea" description="Para ti o para alguien del equipo.">
      <NewTaskForm
        users={users}
        currentUserId={user.id}
        canPool={can.manageLeads(user)}
        defaultSede={user.sede}
        prefill={prefill}
        backHref={back}
        openCreated={openCreated}
      />
    </FormPage>
  );
}
