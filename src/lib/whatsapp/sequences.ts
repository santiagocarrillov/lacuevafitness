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
import { renderTemplate, TEMPLATE_FALLBACK, templateForFollowup, templateName } from "./templates";
import { SEDE_INFO } from "./agent";
import { writeNoReplyNudge } from "./followup-writer";
import { createPostponeTask } from "./postpone";
import { createNoShowTask } from "@/lib/leads/noshow-task";
import { fetchMetaTemplates } from "./graph";
import type { FollowupKind, LeadStage, Sede } from "@/generated/prisma/client";

const WINDOW_MS = 24 * 60 * 60 * 1000;
/** Ecuador es UTC-5 todo el año (no hay horario de verano). */
const EC_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Techo de plantillas por día (hora de Ecuador). Cada plantilla cuesta y, si un
 * lote grande genera bloqueos, Meta baja la calidad del número y se cae el canal
 * entero. Santiago pidió arrancar con un lote chico y medir: 15/día; el 16 oct
 * 2026 lo subió a 25 (siguiente paso: 40 si la calidad del número aguanta). Ponerlo en 0
 * apaga los envíos por plantilla sin tocar código.
 */
const TEMPLATE_DAILY_LIMIT = Number(process.env.WHATSAPP_TEMPLATE_DAILY_LIMIT ?? 25);

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

// ── Rescate de no-show ──────────────────────────────────────────────────────

/**
 * Los tres toques a quien faltó a su primera sesión, en orden.
 *
 * Hasta el 22 oct 2026 era uno solo: de 49 rescates desde el 1 sep, 30 nunca
 * contestaron y nadie les volvió a escribir. Ahora: el día que faltó (texto si la
 * ventana sigue abierta, si no `noshow_recuperacion`), a los 3 días
 * (`noshow_dia3`, ¿fue el horario?) y a los 7 (`noshow_dia7`, ¿lo dejamos para
 * después?). Ese día 7 queda además una tarea de llamada para recepción
 * (noshow-task.ts). Todo se corta si contesta, reagenda o viene.
 */
export const NOSHOW_KINDS: FollowupKind[] = ["NOSHOW_RECOVERY_1D", "NOSHOW_RECOVERY_3D", "NOSHOW_RECOVERY_7D"];

/** Toques que esperan la aprobación de su plantilla en vez de cancelarse (ver processDueFollowups). */
const HOLD_UNTIL_APPROVED: FollowupKind[] = ["NOSHOW_RECOVERY_3D", "NOSHOW_RECOVERY_7D"];

/** Entre el toque del día 3 y el del día 7 pasan al menos estos días, aunque el 3 haya salido tarde. */
const NOSHOW_GAP_DAYS = 4;

/** Cuándo sale cada toque, contando desde que se marcó el no-show (puro: scripts/test-noshow.ts). */
export function noShowTimes(markedAt: Date): { first: Date; day3: Date; day7: Date } {
  const at = (ms: number) => nextSendableAt(new Date(markedAt.getTime() + ms));
  return { first: at(60_000), day3: at(3 * DAY_MS), day7: at(7 * DAY_MS) };
}

/**
 * Programa el rescate. `times.first` en null salta el primer toque: lo usa la
 * reactivación de no-shows viejos, que ya recibieron `noshow_recuperacion`.
 */
export async function scheduleNoShowTouches(
  conversationId: string,
  lead: { firstName: string | null; lastName: string | null },
  times: { first: Date | null; day3: Date; day7: Date },
  firstMessage: string,
): Promise<void> {
  if (times.first) await scheduleFollowup(conversationId, "NOSHOW_RECOVERY_1D", times.first, firstMessage);
  // El texto guardado es el de la plantilla, por si al dispararse el lead hubiera
  // reabierto la ventana (entonces sale como texto libre).
  const ctx = { firstName: lead.firstName, lastName: lead.lastName, sede: null, trialScheduledAt: null };
  for (const [kind, at] of [["NOSHOW_RECOVERY_3D", times.day3], ["NOSHOW_RECOVERY_7D", times.day7]] as const) {
    const spec = templateForFollowup(kind, ctx);
    if (spec) await scheduleFollowup(conversationId, kind, at, renderTemplate(spec));
  }
}

/** Cancela el rescate pendiente (reagendó, vino, pasó a una persona…). */
export async function cancelNoShowTouches(conversationId: string, reason: string): Promise<void> {
  await prisma.scheduledFollowup.updateMany({
    where: { conversationId, kind: { in: NOSHOW_KINDS }, status: "PENDING" },
    data: { status: "CANCELED", errorMessage: reason },
  });
}

// ── Cadencia para leads que dejan de contestar ──────────────────────────────

/** Toques de la cadencia de no respuesta, en orden. */
const NO_REPLY_KINDS: FollowupKind[] = ["NO_REPLY_2H", "NO_REPLY_1D", "NO_REPLY_3D", "NO_REPLY_7D", "NO_REPLY_14D"];

/** Los dos primeros van dentro de la ventana de 24 h: texto libre que redacta el agente. */
const WRITTEN_STEP: Partial<Record<FollowupKind, 1 | 2>> = { NO_REPLY_2H: 1, NO_REPLY_1D: 2 };

/**
 * Etapas en que un lead sigue en la cadencia. Agendado, en prueba, convertido o
 * perdido tienen su propio camino (o ninguno). El no-show entra desde el 22 oct
 * 2026: mientras no contesta lo cubre el rescate (NOSHOW_*), pero si contesta y
 * vuelve a quedarse callado, antes nadie le escribía más.
 */
export const NO_REPLY_STAGES: LeadStage[] = ["NEW", "CONTACTED", "NEGOTIATING", "TRIAL_NO_SHOW"];

/** Cuántos seguimientos redacta el agente por corrida (cada uno es una llamada al modelo). */
const WRITTEN_PER_RUN = 10;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** El mismo día de Ecuador a las 20:30 (o el anterior si `prevDay`). */
function ecuadorEvening(at: Date, prevDay: boolean): Date {
  const ec = new Date(at.getTime() - EC_OFFSET_MS);
  if (prevDay) ec.setUTCDate(ec.getUTCDate() - 1);
  ec.setUTCHours(20, 30, 0, 0);
  return new Date(ec.getTime() + EC_OFFSET_MS);
}

/**
 * Programa la cadencia para un lead que acaba de recibir nuestra respuesta.
 *
 * Pedido de Santiago (16 oct 2026): seguir SIEMPRE y a tiempo. Antes los
 * NO_REPLY existían pero nada los programaba (solo un script a mano), y 364 de
 * 410 conversaciones llevaban más de 72 h en silencio. Se cuenta desde nuestro
 * último mensaje; cada respuesta nueva del agente reinicia la cadencia.
 *
 *   +3 h          texto libre, lo redacta el agente (gratis, dentro de la ventana)
 *   antes de que cierre la ventana (~22 h tras su último mensaje): texto libre
 *   día 3         plantilla reengagement_no_reply
 *   día 7         plantilla lead_dia7
 *   día 14        plantilla lead_dia14 (despedida: "¿ya descartaste…?")
 *
 * Todo cae en la franja de envío. El segundo toque, si caería de noche o de
 * madrugada, se adelanta a las 20:30 para no perder la ventana gratis.
 * `processDueFollowups` cancela lo pendiente si el lead contesta o cambia de etapa.
 */
export async function scheduleNoReplyCadence(
  conversationId: string,
  opts: { sentAt: Date; lastInboundAt: Date | null; firstName: string | null; lastName?: string | null },
): Promise<void> {
  await cancelNoReplyCadence(conversationId, "reemplazado por una cadencia nueva");

  const name = templateName(opts.firstName, opts.lastName);
  const hola = name === "qué tal" ? "¡Hola!" : `¡Hola ${name}!`;
  const t = noReplyTimes(opts.sentAt, opts.lastInboundAt);

  if (t.first) {
    await scheduleFollowup(conversationId, "NO_REPLY_2H", t.first,
      `${hola} ¿Te queda mejor entrenar en la mañana o en la tarde? Así te paso los horarios. 💪`);
  }
  if (t.second) {
    await scheduleFollowup(conversationId, "NO_REPLY_1D", t.second,
      `${hola} Esta semana todavía puedes arrancar tus dos semanas por $9. ¿Qué día te quedaría mejor? Si prefieres dejarlo para más adelante, me dices sin problema. 🙂`);
  }

  // Días 3, 7 y 14: plantillas. El texto guardado es el de la plantilla, por si
  // al dispararse el lead hubiera reabierto la ventana.
  const ctx = { firstName: opts.firstName, lastName: opts.lastName, sede: null, trialScheduledAt: null };
  for (const [kind, days] of [["NO_REPLY_3D", 3], ["NO_REPLY_7D", 7], ["NO_REPLY_14D", 14]] as const) {
    const spec = templateForFollowup(kind, ctx);
    if (!spec) continue;
    await scheduleFollowup(conversationId, kind, t.templates[days], renderTemplate(spec));
  }
}

/**
 * Cuándo sale cada toque (puro, para probarlo: scripts/test-followups.ts).
 * `first`/`second` son null cuando no caben dentro de la ventana gratis.
 */
export function noReplyTimes(
  sentAtDate: Date,
  lastInboundAt: Date | null,
): { first: Date | null; second: Date | null; templates: Record<3 | 7 | 14, Date> } {
  const sentAt = sentAtDate.getTime();
  // Margen para no mandar texto libre en el filo: el cron corre cada 15 min.
  const windowEnd = lastInboundAt ? lastInboundAt.getTime() + WINDOW_MS - 45 * 60 * 1000 : 0;

  // Toque 1: +3 h.
  const firstAt = nextSendableAt(new Date(sentAt + 3 * HOUR_MS));
  const first = firstAt.getTime() < windowEnd ? firstAt : null;

  // Toque 2: justo antes de que cierre la ventana, en horario humano.
  let second: Date | null = null;
  if (lastInboundAt) {
    let at = new Date(lastInboundAt.getTime() + 22 * HOUR_MS);
    const hour = new Date(at.getTime() - EC_OFFSET_MS).getUTCHours();
    if (hour >= SEND_WINDOW_END_H) at = ecuadorEvening(at, false);
    else if (hour < SEND_WINDOW_START_H) at = ecuadorEvening(at, true);
    const notBefore = first ? first.getTime() + 4 * HOUR_MS : sentAt + 6 * HOUR_MS;
    if (at.getTime() >= notBefore && at.getTime() < windowEnd) second = at;
  }

  const day = (n: number) => nextSendableAt(new Date(sentAt + n * DAY_MS));
  return { first, second, templates: { 3: day(3), 7: day(7), 14: day(14) } };
}

/** Cancela los toques pendientes de la cadencia (el lead contestó, agendó, pidió parar…). */
export async function cancelNoReplyCadence(conversationId: string, reason: string): Promise<void> {
  await prisma.scheduledFollowup.updateMany({
    where: { conversationId, kind: { in: NO_REPLY_KINDS }, status: "PENDING" },
    data: { status: "CANCELED", errorMessage: reason },
  });
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
  /** Toques de no-show esperando que Meta apruebe su plantilla (o su turno): siguen PENDING. */
  templateHeld: number;
  /** Conversations whose scheduled hand-back to the bot came due. */
  botResumed: number;
  /** Seguimientos de no respuesta que redactó el agente en esta corrida. */
  written: number;
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
    templateHeld: 0,
    botResumed,
    written: 0,
  };
  // Plantillas aprobadas en Meta, pedidas una sola vez y solo si hacen falta.
  // Si la consulta falla, no se frena nada (null): Meta rechazará lo que no exista.
  let approved: Set<string> | null | undefined;
  const isApproved = async (name: string) => {
    if (approved === undefined) {
      const { templates, error } = await fetchMetaTemplates();
      approved = error ? null : new Set(templates.filter((t) => t.status === "APPROVED").map((t) => t.name));
    }
    return approved === null || approved.has(name);
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

    if (NO_REPLY_KINDS.includes(f.kind)) {
      // El lead contestó después de que se programó: la cadencia ya no aplica (el
      // agente le respondió y programó una nueva si hacía falta).
      if (conv.lastInboundAt && conv.lastInboundAt > f.createdAt) {
        await mark(f.id, "CANCELED", "el lead contestó");
        summary.skipped += 1;
        continue;
      }
      if (conv.lead && !NO_REPLY_STAGES.includes(conv.lead.stage)) {
        await mark(f.id, "CANCELED", `el lead pasó a ${conv.lead.stage}`);
        summary.skipped += 1;
        continue;
      }
    }

    if (NOSHOW_KINDS.includes(f.kind)) {
      const lead = conv.lead;
      if (!lead || lead.stage !== "TRIAL_NO_SHOW") {
        await mark(f.id, "CANCELED", `el lead pasó a ${lead?.stage ?? "?"}`);
        summary.skipped += 1;
        continue;
      }
      if (conv.lastInboundAt && conv.lastInboundAt > f.createdAt) {
        await mark(f.id, "CANCELED", "el lead contestó");
        summary.skipped += 1;
        continue;
      }
      if (f.kind === "NOSHOW_RECOVERY_7D") {
        // El día 7 nunca sale pegado al día 3 (si el 3 esperó la aprobación de
        // Meta, saldrían los dos en la misma corrida).
        const day3 = await prisma.scheduledFollowup.findFirst({
          where: { conversationId: conv.id, kind: "NOSHOW_RECOVERY_3D", createdAt: { lte: f.createdAt } },
          orderBy: { createdAt: "desc" },
          select: { status: true, sentAt: true },
        });
        if (day3?.status === "PENDING") {
          summary.templateHeld += 1;
          continue;
        }
        const earliest = day3?.status === "SENT" && day3.sentAt
          ? nextSendableAt(new Date(day3.sentAt.getTime() + NOSHOW_GAP_DAYS * DAY_MS))
          : null;
        if (earliest && earliest > now) {
          await prisma.scheduledFollowup.update({ where: { id: f.id }, data: { fireAt: earliest } });
          summary.templateHeld += 1;
          continue;
        }
        // Tres mensajes sin respuesta: que llame una persona. Sale aunque la
        // plantilla no esté aprobada todavía.
        if (lead.trialScheduledAt) await createNoShowTask(lead, lead.trialScheduledAt);
      }
    }

    const writtenStep = WRITTEN_STEP[f.kind];
    if (writtenStep) {
      // Texto libre o nada: estos toques no gastan plantilla.
      if (!withinWindow) {
        await mark(f.id, "CANCELED", "se cerró la ventana de 24 h");
        summary.skipped += 1;
        continue;
      }
      if (summary.written >= WRITTEN_PER_RUN) continue; // sigue PENDING: la próxima corrida
      const written = await writeNoReplyNudge(conv.id, writtenStep);
      summary.written += 1;
      if (written && "postpone" in written) {
        // Dijo antes que le escribiéramos en otra fecha: nada de cadencia, una
        // tarea para ese día (ver postpone.ts).
        await mark(f.id, "CANCELED", "el lead pidió que le escribamos más adelante");
        await cancelNoReplyCadence(conv.id, `el lead pidió que le escribamos el ${written.postpone.toISOString().slice(0, 10)}`);
        if (conv.lead) await createPostponeTask(conv.lead, written.postpone, written.said);
        summary.skipped += 1;
        continue;
      }
      if (written && "skip" in written) {
        await mark(f.id, "CANCELED", "el agente no escribe: el lead pidió parar");
        await cancelNoReplyCadence(conv.id, "el lead pidió parar");
        summary.skipped += 1;
        continue;
      }
      const text = written?.text ?? message;
      try {
        const sent = await sendText(conv.externalId, text);
        await recordOutbound(conv.id, text, sent.messageId);
        await markSent(f.id, { ...(f.payload as object), message: text, writtenByAgent: written != null }, null);
        await touchOutbound(conv.id);
        summary.sent += 1;
      } catch (err) {
        await mark(f.id, "FAILED", describeSendError(err));
        summary.failed += 1;
      }
      continue;
    }

    if (!withinWindow) {
      // Las plantillas se arman con datos del lead. Una conversación de socio no
      // tiene lead: sus recordatorios son otra cadena y todavía no existen.
      let spec = conv.lead ? templateForFollowup(f.kind, conv.lead) : null;
      const backup = spec ? TEMPLATE_FALLBACK[spec.name] : undefined;
      if (spec && backup && !(await isApproved(spec.name)) && (await isApproved(backup))) {
        spec = { ...spec, name: backup };
      }
      if (!spec) {
        await mark(f.id, "FAILED", `fuera de ventana 24h y ${f.kind} no tiene plantilla aplicable`);
        summary.failed += 1;
        continue;
      }
      if (!(await isApproved(spec.name))) {
        if (HOLD_UNTIL_APPROVED.includes(f.kind)) {
          // Plantilla nueva en revisión: espera (hasta maxLateMs) en vez de perder el toque.
          summary.templateHeld += 1;
          continue;
        }
        await mark(f.id, "CANCELED", `plantilla ${spec.name} sin aprobar en Meta`);
        summary.skipped += 1;
        continue;
      }
      if (templateBudget <= 0) {
        // Se queda PENDING a propósito: lo toma la corrida de mañana, cuando el
        // techo diario se reinicia. Nada que reprogramar a mano.
        summary.templateThrottled += 1;
        continue;
      }
      try {
        const sent = await sendTemplate(conv.externalId, spec.name, spec.language, spec.variables);
        await recordOutbound(conv.id, renderTemplate(spec), sent.messageId);
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
      const sent = await sendText(conv.externalId, message);
      await recordOutbound(conv.id, message, sent.messageId);
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

/**
 * Deja el mensaje enviado en el hilo de la conversación.
 *
 * Sin esto el cliente recibe el WhatsApp y el inbox no se entera: quien abre la
 * conversación ve un silencio que no existe. Se marca como automático dejando
 * `llmGenerated: false` y `sentByUserId: null` — esa combinación no la usa nadie
 * más, así que el inbox la puede etiquetar sin ambigüedad.
 *
 * Nunca tumba el envío: el mensaje YA salió, y perder la fila del historial es
 * malo pero marcar el followup como fallido sería peor (lo reintentaría).
 */
async function recordOutbound(
  conversationId: string,
  body: string,
  externalId: string | null,
): Promise<void> {
  try {
    await prisma.message.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        channel: "WHATSAPP",
        externalId: externalId ?? undefined,
        body,
        llmGenerated: false,
        sentByUserId: null,
        sendStatus: "SENT",
        sendAttemptedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("[followups] no se pudo guardar el saliente en el hilo", conversationId, err);
  }
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
