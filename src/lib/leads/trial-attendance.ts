/**
 * Bridge between the sales funnel and the attendance ledger.
 *
 * A lead books their first $9 session through the bot (`Lead.trialScheduledAt`),
 * then walks into the gym — where admins register attendance, not lead stages.
 * Until now those were two disconnected worlds: on 18-19 sep seven leads had
 * appointments and `trialAttended` stayed null for every one of them, so nobody
 * could say what an ad-driven appointment was actually worth.
 *
 * The join is `Member.leadId`: a lead who shows up gets a Member row (status
 * TRIAL — they are training for two weeks, so staff will register them daily
 * from the normal search), their visit lands in the same `Attendance` table as
 * everyone else, and the funnel stage moves in the same transaction.
 *
 * Plain module (no "use server"): imported by server actions and the cron route.
 */

import { prisma } from "@/lib/prisma";
import { nextSendableAt, scheduleFollowup } from "@/lib/whatsapp/sequences";
import { templateName } from "@/lib/whatsapp/templates";
import type { Prisma } from "@/generated/prisma/client";

/** Grace period after a booked slot before we call it a no-show. */
export const NO_SHOW_GRACE_MS = 3 * 60 * 60 * 1000;

/**
 * Texto del rescate. Solo se usa si la conversación sigue dentro de la ventana
 * de 24h; fuera de ella sale la plantilla `noshow_recuperacion`, que dice lo
 * mismo. `payload.message` es obligatorio: sin él el cron cancela el followup.
 */
function recoveryMessage(firstName: string | null, lastName: string | null): string {
  return (
    `¡Hola ${templateName(firstName, lastName)}! 😊 Vimos que no pudiste venir a tu primera ` +
    `sesión. ¿La reagendamos? Tenemos cupos esta semana. Recuerda: entrenas dos semanas por ` +
    `tan solo $9 y aprovechas todo un proceso de evaluación de tu condición física y de ` +
    `salud. ¿Qué día te queda mejor?`
  );
}

/**
 * Move past-due appointments nobody registered to TRIAL_NO_SHOW, and schedule
 * the rescue message for each one.
 *
 * Marcar el no-show nunca bastó: el 21 sep cuatro personas agendaron, ninguna
 * llegó y nadie les volvió a escribir. `NOSHOW_RECOVERY_1D` y la plantilla
 * `noshow_recuperacion` existían desde el 21, pero NADA las programaba — había
 * que sembrarlas a mano. Esto cierra el circuito: quien no viene recibe la
 * invitación a reagendar sin que nadie se acuerde de hacerlo.
 *
 * Re-marcar sigue siendo seguro: registrar la visita después devuelve el lead a
 * TRIAL_ATTENDED, y el rescate ya programado se cancela solo si alguien toma la
 * conversación (el cron descarta followups con el bot en pausa).
 */
export async function markMissedTrials(
  now: Date = new Date(),
): Promise<{ marked: number; recoveries: number }> {
  const cutoff = new Date(now.getTime() - NO_SHOW_GRACE_MS);
  const missed = await prisma.lead.findMany({
    where: {
      stage: "SCHEDULED_TRIAL",
      trialScheduledAt: { not: null, lt: cutoff },
      trialAttended: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      trialScheduledAt: true,
      conversation: { select: { id: true } },
    },
  });
  if (missed.length === 0) return { marked: 0, recoveries: 0 };

  await prisma.lead.updateMany({
    where: { id: { in: missed.map((l) => l.id) } },
    data: { stage: "TRIAL_NO_SHOW", trialAttended: false },
  });

  let recoveries = 0;
  for (const lead of missed) {
    // Sin conversación de WhatsApp no hay a dónde escribir (leads del formulario
    // web, altas a mano). El lead igual queda marcado como no-show.
    if (!lead.conversation) continue;

    // Una sola invitación por cita: si reagenda y vuelve a faltar, la nueva cita
    // es posterior y sí genera otra. Así no se acumulan rescates del mismo plantón.
    const yaTiene = await prisma.scheduledFollowup.findFirst({
      where: {
        conversationId: lead.conversation.id,
        kind: { in: ["NOSHOW_RECOVERY_1D", "NOSHOW_RECOVERY_3D"] },
        createdAt: { gte: lead.trialScheduledAt! },
      },
      select: { id: true },
    });
    if (yaTiene) continue;

    await scheduleFollowup(
      lead.conversation.id,
      "NOSHOW_RECOVERY_1D",
      nextSendableAt(new Date(now.getTime() + 60_000)),
      recoveryMessage(lead.firstName, lead.lastName),
    );
    recoveries += 1;
  }

  return { marked: missed.length, recoveries };
}

/**
 * Mark a lead as having attended their evaluation. Idempotent.
 *
 * Runs inside the caller's transaction so a visit is never half-recorded: either
 * the attendance row and the funnel move together, or neither does.
 */
export async function markLeadAttended(
  tx: Prisma.TransactionClient,
  leadId: string,
  opts: { userId?: string | null; note?: string } = {},
): Promise<{ changed: boolean }> {
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: { stage: true, trialAttended: true },
  });
  if (!lead) return { changed: false };
  if (lead.trialAttended === true) return { changed: false }; // already recorded today

  // TRIAL_ATTENDED is a milestone, not a terminal state: a lead who is already
  // negotiating or closed must not be walked backwards in the funnel.
  const advances = lead.stage === "NEW" || lead.stage === "CONTACTED"
    || lead.stage === "SCHEDULED_TRIAL" || lead.stage === "TRIAL_NO_SHOW";

  await tx.lead.update({
    where: { id: leadId },
    data: { trialAttended: true, ...(advances ? { stage: "TRIAL_ATTENDED" } : {}) },
  });
  await tx.leadInteraction.create({
    data: {
      leadId,
      userId: opts.userId ?? null,
      channel: "WALK_IN",
      summary: opts.note ?? "Asistió a su evaluación (registrado en asistencia).",
    },
  });
  return { changed: true };
}
