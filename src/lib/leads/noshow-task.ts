/**
 * The person behind the no-show rescue: a CALL task for the lead's sede.
 *
 * Until 22 oct 2026 a no-show got ONE WhatsApp ("¿la reagendamos?") and nothing
 * else: of 49 rescued since 1 sep, 30 never answered and nobody followed up. Now
 * the rescue is three messages (now, day 3, day 7 — trial-attendance.ts) and, on
 * day 7, a call: by then three texts went unanswered and a voice is the last
 * thing left to try. Unassigned in the sede's pool, like the automatic tasks.
 *
 * The pure plan is tested in scripts/test-noshow.ts.
 */

import { prisma } from "@/lib/prisma";
import { ecuadorParts } from "@/lib/timezone";
import type { Sede, StaffTaskType } from "@/generated/prisma/client";

export const NOSHOW_TASK_PREFIX = "noshow:";
const OPEN = ["TODO", "IN_PROGRESS", "WAITING"] as const;

export type NoShowLead = { id: string; firstName: string; lastName: string | null; sede: Sede; phone: string | null };

export type NoShowTaskPlan = {
  autoKey: string;
  title: string;
  detail: string;
  type: StaffTaskType;
  priority: number;
  sede: Sede;
  leadId: string;
  dueDate: Date;
};

/** "22 sep" for an instant, read in Ecuador. */
const shortDay = (d: Date) => d.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "short" });
const ymd = (d: Date) => {
  const { year, month, day } = ecuadorParts(d);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/** What the task says. Pure, so the test can read it. */
export function noShowTaskPlan(lead: NoShowLead, appointment: Date, now: Date = new Date()): NoShowTaskPlan {
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const { year, month, day } = ecuadorParts(now);
  return {
    // One per missed appointment: a retry never duplicates it; a new no-show is a new task.
    autoKey: `${NOSHOW_TASK_PREFIX}${lead.id}:${ymd(appointment)}`,
    title: `Llamar a ${fullName}: faltó a su primera sesión del ${shortDay(appointment)} y no contesta`,
    detail:
      (lead.phone ? `Teléfono: ${lead.phone}. ` : "") +
      "Le escribimos por WhatsApp desde el día que faltó (y a los 3 y 7 días) y no ha contestado. " +
      "Llámale: pregúntale qué pasó y ofrécele un día y una hora para arrancar sus dos semanas por $9. " +
      "Si ya no le interesa, márcalo como Perdido en su ficha con el motivo; si pide que le escribamos más adelante, " +
      "anota la fecha en la tarea.",
    type: "CALL",
    priority: 1,
    sede: lead.sede,
    leadId: lead.id,
    dueDate: new Date(Date.UTC(year, month - 1, day)),
  };
}

/** Leave the call for today. Never throws: the WhatsApp side goes on regardless. */
export async function createNoShowTask(lead: NoShowLead, appointment: Date): Promise<void> {
  const plan = noShowTaskPlan(lead, appointment);
  try {
    const existing = await prisma.staffTask.findUnique({ where: { autoKey: plan.autoKey }, select: { id: true } });
    if (existing) return;
    await prisma.$transaction(async (tx) => {
      const t = await tx.staffTask.create({ data: plan });
      await tx.staffTaskEntry.create({
        data: { taskId: t.id, kind: "EVENT", body: "La creó el rescate de no-show: tres WhatsApp sin respuesta." },
      });
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return; // a concurrent run created it
    console.error("[noshow] no se pudo crear la tarea de llamada", { leadId: lead.id, err });
  }
}

/** The lead booked again or came in: the pending call no longer applies. */
export async function closeNoShowTasks(leadId: string, outcome: string): Promise<void> {
  try {
    await prisma.staffTask.updateMany({
      where: { leadId, autoKey: { startsWith: NOSHOW_TASK_PREFIX }, status: { in: [...OPEN] } },
      data: { status: "DONE", doneAt: new Date(), outcome },
    });
  } catch (err) {
    console.error("[noshow] no se pudo cerrar la tarea de llamada", { leadId, err });
  }
}
