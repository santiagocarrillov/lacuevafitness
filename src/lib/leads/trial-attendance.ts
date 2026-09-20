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
import type { Prisma } from "@/generated/prisma/client";

/** Grace period after a booked slot before we call it a no-show. */
export const NO_SHOW_GRACE_MS = 3 * 60 * 60 * 1000;

/**
 * Move past-due appointments nobody registered to TRIAL_NO_SHOW.
 *
 * DB only — it sends nothing. Without it the funnel can't tell "didn't come"
 * from "came but nobody wrote it down", and both look like a silent SCHEDULED_TRIAL
 * forever. Re-marking is safe: registering the visit later flips the lead back to
 * TRIAL_ATTENDED.
 */
export async function markMissedTrials(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - NO_SHOW_GRACE_MS);
  const { count } = await prisma.lead.updateMany({
    where: {
      stage: "SCHEDULED_TRIAL",
      trialScheduledAt: { not: null, lt: cutoff },
      trialAttended: null,
    },
    data: { stage: "TRIAL_NO_SHOW", trialAttended: false },
  });
  return count;
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
