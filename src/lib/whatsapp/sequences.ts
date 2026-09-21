/**
 * Sequence engine — schedules and fires ScheduledFollowup rows.
 *
 * Producers (e.g. the agent booking an evaluation) call scheduleTrialReminders().
 * A cron endpoint calls processDueFollowups() to actually send what's due.
 *
 * Meta's 24h service window: free-text replies are only allowed within 24h of the
 * lead's last inbound. Reminders usually fire OUTSIDE that window, so they require
 * an APPROVED template. Until templates are wired we send free text when we happen
 * to be inside the window, and mark out-of-window sends FAILED (to be re-sent as a
 * template once approved) instead of silently dropping them.
 *
 * Note: this module writes ScheduledFollowup rows, never Message rows — a
 * followup's own outcome already lives in ScheduledFollowup.status/errorMessage,
 * which is the same convention as Message.sendStatus/sendError. If followups ever
 * start persisting Message rows, stamp sendStatus/sendError/sendAttemptedAt on
 * them the way agent-runner.ts does.
 */

import { prisma } from "@/lib/prisma";
import { sendText } from "./client";
import { SEDE_INFO } from "./agent";
import type { FollowupKind, Sede } from "@/generated/prisma/client";

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Create a followup unless its fire time is already in the past. */
export async function scheduleFollowup(
  conversationId: string,
  kind: FollowupKind,
  fireAt: Date,
  message: string,
): Promise<void> {
  if (fireAt.getTime() <= Date.now()) return;
  await prisma.scheduledFollowup.create({
    data: { conversationId, kind, fireAt, status: "PENDING", payload: { message } },
  });
}

/**
 * (Re)schedule the 24h + 1h anti-no-show reminders for a booked evaluation.
 *
 * The close-in reminder was 2h; Santiago moved it to 1h (21 sep 2026) — cerca
 * suficiente para que la persona ya esté decidiendo si sale de casa. Cancels any
 * prior pending trial reminders on the conversation first (including legacy 2h
 * ones), so a reschedule doesn't leave stale reminders.
 */
export async function scheduleTrialReminders(
  conversationId: string,
  when: Date,
  leadFirstName: string | null,
  sede: Sede | null,
): Promise<void> {
  await prisma.scheduledFollowup.updateMany({
    where: {
      conversationId,
      kind: { in: ["TRIAL_REMINDER_24H", "TRIAL_REMINDER_2H", "TRIAL_REMINDER_1H"] },
      status: "PENDING",
    },
    data: { status: "CANCELED" },
  });

  const name = leadFirstName?.split(/\s+/)[0] ?? "";
  const sedeName = sede ? SEDE_INFO[sede].name : "La Cueva";
  const hora = new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(when);

  await scheduleFollowup(
    conversationId, "TRIAL_REMINDER_24H", new Date(when.getTime() - 24 * 60 * 60 * 1000),
    `¡Hola ${name}! 👋 Mañana arrancas tus dos semanas de evaluación en ${sedeName} a las ${hora}. Llega 15 min antes. ¿Confirmas que vienes? 💪`,
  );
  await scheduleFollowup(
    conversationId, "TRIAL_REMINDER_1H", new Date(when.getTime() - 60 * 60 * 1000),
    `¡Hola ${name}! En una hora es tu primera sesión en ${sedeName} (${hora}). Llega 15 min antes para tomarte los datos de tu evaluación. ¡Te esperamos! 📍💪`,
  );
}

export type ProcessSummary = {
  due: number;
  sent: number;
  failed: number;
  skipped: number;
  /** Conversations whose scheduled hand-back to the bot came due. */
  botResumed: number;
};

/**
 * Un-pause conversations whose scheduled hand-back has come due.
 *
 * Purely a DB sweep — it sends nothing. The runner also releases a due hold when
 * an inbound arrives (that is what answers the lead in real time); this keeps the
 * inbox honest for conversations where nobody wrote, so staff see "🤖 Bot" on
 * Monday morning instead of a human badge nobody owns.
 */
export async function releaseDueBotHolds(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.conversation.updateMany({
    where: { botPaused: true, botResumeAt: { lte: now } },
    data: { botPaused: false, botResumeAt: null },
  });
  return count;
}

/** Send every followup whose fireAt has passed. Called by the cron endpoint. */
export async function processDueFollowups(limit = 100): Promise<ProcessSummary> {
  const now = new Date();
  // Before sending anything: give back the conversations whose hold expired, so a
  // followup for one of them isn't skipped as "paused" a second later.
  const botResumed = await releaseDueBotHolds(now);
  const due = await prisma.scheduledFollowup.findMany({
    where: { status: "PENDING", fireAt: { lte: now } },
    orderBy: { fireAt: "asc" },
    take: limit,
    include: { conversation: true },
  });

  const summary: ProcessSummary = { due: due.length, sent: 0, failed: 0, skipped: 0, botResumed };

  for (const f of due) {
    const conv = f.conversation;
    const message = (f.payload as { message?: string } | null)?.message;

    if (!message) {
      await mark(f.id, "CANCELED", "followup sin mensaje");
      summary.skipped += 1;
      continue;
    }
    if (conv.botPaused) {
      await mark(f.id, "CANCELED", "conversación en handoff (bot en pausa)");
      summary.skipped += 1;
      continue;
    }

    const withinWindow =
      conv.lastInboundAt != null &&
      now.getTime() - new Date(conv.lastInboundAt).getTime() < WINDOW_MS;

    if (!withinWindow) {
      await mark(f.id, "FAILED", "fuera de ventana 24h — requiere template aprobada");
      summary.failed += 1;
      continue;
    }

    try {
      await sendText(conv.externalId, message);
      await prisma.scheduledFollowup.update({
        where: { id: f.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { lastOutboundAt: new Date() },
      });
      summary.sent += 1;
    } catch (err) {
      await mark(f.id, "FAILED", err instanceof Error ? err.message : "error al enviar");
      summary.failed += 1;
    }
  }

  return summary;
}

async function mark(id: string, status: "CANCELED" | "FAILED", errorMessage: string) {
  await prisma.scheduledFollowup.update({ where: { id }, data: { status, errorMessage } });
}
