"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSedeScope, can } from "@/lib/auth";
import { todayDateUtc, ecuadorDateAt } from "@/lib/timezone";

export type StaffTaskRow = {
  id: string;
  sede: "FITNESS_CENTER" | "XTREME" | null;
  title: string;
  detail: string | null;
  done: boolean;
  doneByName: string | null;
  outcome: string | null;
  lead: {
    id: string;
    name: string;
    conversationId: string | null;
  } | null;
};

/**
 * Tareas que la recepción ve hoy: las pendientes desde su `dueDate` y las que
 * se cerraron hoy (tachadas, para que se vea lo avanzado). Cada admin ve las de
 * su sede más las de las dos sedes; dueños y contabilidad ven todas.
 */
export async function getTodayStaffTasks(): Promise<StaffTaskRow[]> {
  const user = await requireAuth();
  if (!can.manageLeads(user)) return [];
  const scope = getSedeScope(user);

  const today = todayDateUtc();
  const startOfToday = ecuadorDateAt(today, 0, 0);

  const tasks = await prisma.staffTask.findMany({
    where: {
      AND: [
        { dueDate: { lte: today } },
        { OR: [{ doneAt: null }, { doneAt: { gte: startOfToday } }] },
        scope ? { OR: [{ sede: scope }, { sede: null }] } : {},
      ],
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: {
      doneBy: { select: { fullName: true } },
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          conversation: { select: { id: true } },
        },
      },
    },
  });

  return tasks
    .map((t) => ({
      id: t.id,
      sede: t.sede,
      title: t.title,
      detail: t.detail,
      done: t.doneAt !== null,
      doneByName: t.doneBy?.fullName ?? null,
      outcome: t.outcome,
      lead: t.lead
        ? {
            id: t.lead.id,
            name: [t.lead.firstName, t.lead.lastName].filter(Boolean).join(" ").trim(),
            conversationId: t.lead.conversation?.id ?? null,
          }
        : null,
    }))
    .sort((a, b) => Number(a.done) - Number(b.done));
}

async function loadOwnTask(id: string) {
  const user = await requireAuth();
  if (!can.manageLeads(user)) return { error: "Sin permisos." } as const;
  const task = await prisma.staffTask.findUnique({ where: { id } });
  if (!task) return { error: "La tarea ya no existe." } as const;
  const scope = getSedeScope(user);
  if (scope && task.sede && task.sede !== scope) {
    return { error: "Esa tarea es de la otra sede." } as const;
  }
  return { user, task } as const;
}

/**
 * Cierra una tarea. El resultado es lo que importa ("confirmó", "no contesta",
 * "reagendó al miércoles"): si la tarea es de un lead, queda también en su
 * historial para que quien abra la ficha sepa qué pasó.
 */
export async function completeStaffTask(
  id: string,
  outcome: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadOwnTask(id);
  if ("error" in loaded) return { ok: false, error: loaded.error! };
  const { user, task } = loaded;
  if (task.doneAt) return { ok: true };

  const note = outcome.trim();
  if (!note) return { ok: false, error: "Cuenta en una línea qué pasó." };

  await prisma.$transaction(async (tx) => {
    await tx.staffTask.update({
      where: { id },
      data: { doneAt: new Date(), doneByUserId: user.id, outcome: note },
    });
    if (task.leadId) {
      await tx.leadInteraction.create({
        data: {
          leadId: task.leadId,
          userId: user.id,
          channel: "OTHER",
          summary: `Tarea «${task.title}»: ${note}`,
        },
      });
    }
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

/** Deshace un "hecho" por error. El registro en el historial del lead se queda. */
export async function reopenStaffTask(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadOwnTask(id);
  if ("error" in loaded) return { ok: false, error: loaded.error! };

  await prisma.staffTask.update({
    where: { id },
    data: { doneAt: null, doneByUserId: null, outcome: null },
  });
  revalidatePath("/dashboard");
  return { ok: true };
}
