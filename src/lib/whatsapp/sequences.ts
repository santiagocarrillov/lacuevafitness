/**
 * Sequence engine — schedules and fires ScheduledFollowup rows.
 *
 * Producers (e.g. the agent booking an evaluation) call scheduleTrialReminders().
 * A cron endpoint calls processDueFollowups() to actually send what's due.
 *
 * Meta's 24h service window: free-text replies are only allowed within 24h of the
 * lead's last inbound. Reminders usually fire OUTSIDE that window, so they require
 * an APPROVED template. Inside the window we send the free text we scheduled;
 * outside it we send the matching approved template (see ./templates.ts), rate
 * limited by WHATSAPP_TEMPLATE_DAILY_LIMIT so a bad batch can't burn the number's
 * quality rating. A followup with no template for its kind is still marked FAILED.
 *
 * Note: this module writes ScheduledFollowup rows, never Message rows — a
 * followup's own outcome already lives in ScheduledFollowup.status/errorMessage,
 * which is the same convention as Message.sendStatus/sendError. If followups ever
 * start persisting Message rows, stamp sendStatus/sendError/sendAttemptedAt on
 * them the way agent-runner.ts does.
 */

import { prisma } from "@/lib/prisma";
import { sendText, sendTemplate, describeSendError } from "./client";
import { templateForFollowup } from "./templates";
import { SEDE_INFO } from "./agent";
import type { FollowupKind, Sede } from "@/generated/prisma/client";

const WINDOW_MS = 24 * 60 * 60 * 1000;
/** Ecuador es UTC-5 todo el año (no hay horario de verano). */
const EC_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Techo de plantillas por día (hora de Ecuador). Cada plantilla cuesta y, si un
 * lote grande genera bloqueos, Meta baja la calidad del número y se cae el canal
 * entero. Santiago pidió arrancar con un lote chico y medir: 15/día. Ponerlo en 0
 * apaga los envíos por plantilla sin tocar código.
 */
const TEMPLATE_DAILY_LIMIT = Number(process.env.WHATSAPP_TEMPLATE_DAILY_LIMIT ?? 15);

/**
 * Cuánto puede llegar tarde un followup antes de que mandarlo haga más daño que
 * bien. Un recordatorio frenado (techo diario, cron caído) que sale 5 horas tarde
 * diciendo "en una hora es tu sesión" queda ridículo y quema confianza; un
 * reenganche que sale un día tarde da igual.
 */
function maxLateMs(kind: FollowupKind): number {
  switch (kind) {
    case "TRIAL_REMINDER_1H":
    case "TRIAL_REMINDER_2H":
      return 90 * 60 * 1000; // hora y media
    case "TRIAL_REMINDER_24H":
      return 12 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

function startOfEcuadorDay(now: Date): Date {
  const local = new Date(now.getTime() - EC_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + EC_OFFSET_MS);
}

/** Cuántas plantillas se enviaron hoy, para no pasarse del techo diario. */
async function templatesSentToday(now: Date): Promise<number> {
  return prisma.scheduledFollowup.count({
    where: {
      status: "SENT",
      sentAt: { gte: startOfEcuadorDay(now) },
      payload: { path: ["sentVia"], equals: "template" },
    },
  });
}

/**
 * Franja en que se le puede escribir a un lead (hora de Ecuador).
 *
 * Medido sobre 7 días de mensajes entrantes: entre medianoche y las 6 no llega
 * casi nada, y el lote de reenganche que salió a las 06:00 del 21 sep tuvo 0
 * respuestas de 12. Las horas vivas son 08-09 y 18-21. Un no-show de las 8 de
 * la noche no puede disparar un mensaje a las 11, así que se empuja a la mañana.
 */
const SEND_WINDOW_START_H = 8;
const SEND_WINDOW_END_H = 21;

/**
 * El mismo instante si cae en franja, o el siguiente arranque de franja si no.
 * Ecuador es UTC-5 todo el año, así que la aritmética en UTC es exacta.
 */
export function nextSendableAt(from: Date): Date {
  const ec = new Date(from.getTime() - EC_OFFSET_MS);
  const hour = ec.getUTCHours();
  if (hour >= SEND_WINDOW_START_H && hour < SEND_WINDOW_END_H) return from;

  const target = new Date(ec);
  if (hour >= SEND_WINDOW_END_H) target.setUTCDate(target.getUTCDate() + 1);
  target.setUTCHours(SEND_WINDOW_START_H, 0, 0, 0);
  return new Date(target.getTime() + EC_OFFSET_MS);
}

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
  /** De los `sent`, cuántos salieron como plantilla (fuera de la ventana de 24h). */
  sentAsTemplate: number;
  /** Fuera de ventana pero frenados por el techo diario: siguen PENDING. */
  templateThrottled: number;
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
    include: { conversation: { include: { lead: true } } },
  });

  const summary: ProcessSummary = {
    due: due.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    sentAsTemplate: 0,
    templateThrottled: 0,
    botResumed,
  };

  // Presupuesto de plantillas de la corrida: lo que queda del techo del día.
  let templateBudget = Math.max(0, TEMPLATE_DAILY_LIMIT - (await templatesSentToday(now)));

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
    if (now.getTime() - f.fireAt.getTime() > maxLateMs(f.kind)) {
      await mark(f.id, "CANCELED", `vencido: debía salir ${f.fireAt.toISOString()}`);
      summary.skipped += 1;
      continue;
    }

    const withinWindow =
      conv.lastInboundAt != null &&
      now.getTime() - new Date(conv.lastInboundAt).getTime() < WINDOW_MS;

    if (!withinWindow) {
      // Las plantillas se arman con datos del lead. Una conversación de socio no
      // tiene lead: sus recordatorios son otra cadena y todavía no existen.
      const spec = conv.lead ? templateForFollowup(f.kind, conv.lead) : null;
      if (!spec) {
        await mark(f.id, "FAILED", `fuera de ventana 24h y ${f.kind} no tiene plantilla aplicable`);
        summary.failed += 1;
        continue;
      }
      if (templateBudget <= 0) {
        // Se queda PENDING a propósito: lo toma la corrida de mañana, cuando el
        // techo diario se reinicia. Nada que reprogramar a mano.
        summary.templateThrottled += 1;
        continue;
      }
      try {
        await sendTemplate(conv.externalId, spec.name, spec.language, spec.variables);
        await markSent(f.id, f.payload, spec.name);
        await touchOutbound(conv.id);
        templateBudget -= 1;
        summary.sent += 1;
        summary.sentAsTemplate += 1;
      } catch (err) {
        await mark(f.id, "FAILED", `plantilla ${spec.name}: ${describeSendError(err)}`);
        summary.failed += 1;
      }
      continue;
    }

    try {
      await sendText(conv.externalId, message);
      await markSent(f.id, f.payload, null);
      await touchOutbound(conv.id);
      summary.sent += 1;
    } catch (err) {
      await mark(f.id, "FAILED", describeSendError(err));
      summary.failed += 1;
    }
  }

  return summary;
}

async function mark(id: string, status: "CANCELED" | "FAILED", errorMessage: string) {
  await prisma.scheduledFollowup.update({ where: { id }, data: { status, errorMessage } });
}

/**
 * Marca el followup como enviado, dejando anotado en el payload si salió por
 * plantilla. Ese `sentVia` es lo que cuenta `templatesSentToday()` para el techo
 * diario, y de paso deja rastro de qué plantilla se usó cuando haya que auditar.
 */
async function markSent(id: string, payload: unknown, template: string | null) {
  const base = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  await prisma.scheduledFollowup.update({
    where: { id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      payload: template
        ? { ...base, sentVia: "template", template }
        : { ...base, sentVia: "text" },
    },
  });
}

async function touchOutbound(conversationId: string) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastOutboundAt: new Date() },
  });
}
