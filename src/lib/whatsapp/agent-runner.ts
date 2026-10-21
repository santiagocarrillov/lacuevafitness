/**
 * Agent runner — bridges the pure agent (agent.ts) to the DB + WhatsApp.
 *
 * Called AFTER the webhook has acked Meta (via `after()` in the route), so the
 * Claude round-trip never delays the 200. It loads the conversation, asks the
 * agent for a reply + qualification, persists the reply as an OUTBOUND Message,
 * updates the Lead (stage/sede), and — only when auto-send is enabled and we're
 * inside Meta's 24h window — actually sends it. With auto-send off, the reply is
 * stored as a DRAFT (llmGenerated, no externalId, never sent) for staff to review.
 *
 * Every outbound row it writes carries Message.sendStatus ("DRAFT" → "SENT" |
 * "FAILED") plus sendError/sendAttemptedAt on failure, so a rejected send stops
 * looking identical to a draft in the inbox. Failures are still never thrown into
 * the webhook — they are persisted, logged and reported through RunOutcome.
 */

import { prisma } from "@/lib/prisma";
import type { LeadStage, Sede } from "@/generated/prisma/client";
import { runAgent, SEDE_INFO, type AgentTurn, type AgentResult } from "./agent";
import { sendText, describeSendError } from "./client";
import { cancelNoReplyCadence, scheduleNoReplyCadence, scheduleTrialReminders } from "./sequences";
import { notifyStaffOfBotHandoff } from "@/lib/push/notify-staff";
import { adContextLine } from "./referral";
import { agentHistory } from "./history";
import { asksForHuman, handoffReply, isThirdRepeat } from "./guards";
import { templateName } from "./templates";
import { memberModeEnabled, socioOf, SOCIO_SELECT } from "./member-mode";
import { runMemberTurn } from "./member-agent-runner";
import { closePostponeTasks, createPostponeTask, parsePostponeDate } from "./postpone";
import { trialAgentContext } from "./trial-touches";
import { ecuadorDateString } from "@/lib/timezone";

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * How long we wait before answering an inbound.
 *
 * Meta delivers every message as its own webhook POST, so a lead who fires off
 * three photos (or "hola" / "buenas" / "quiero info") used to trigger three
 * independent agent runs — each blind to the others. On 19 sep one lead got four
 * near-identical greetings inside 1.5s. During this window later messages land,
 * and only the newest trigger survives the check below, so the burst collapses
 * into a single reply that has read everything.
 */
const DEBOUNCE_MS = Number(process.env.WHATSAPP_AGENT_DEBOUNCE_MS ?? 4000);

/** A claimed run older than this is treated as crashed and can be re-claimed. */
const LOCK_STALE_MS = 2 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Claim the conversation for this run. Atomic: the WHERE clause is evaluated by
 * Postgres, so exactly one of N concurrent runs gets count === 1.
 */
async function claimAgentLock(conversationId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);
  const { count } = await prisma.conversation.updateMany({
    where: {
      id: conversationId,
      OR: [{ agentLockedAt: null }, { agentLockedAt: { lt: staleBefore } }],
    },
    data: { agentLockedAt: new Date() },
  });
  return count === 1;
}

async function releaseAgentLock(conversationId: string): Promise<void> {
  try {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { agentLockedAt: null },
    });
  } catch (err) {
    // Never let lock bookkeeping break a run that already answered the lead.
    console.error("[whatsapp-agent] could not release lock", { conversationId, err });
  }
}

/**
 * Build the map link(s) the agent asked to share. We attach these in code (never
 * from the model) so the URL is always correct — the LLM must not emit URLs.
 */
function locationSuffix(share: AgentResult["shareLocation"], sede: Sede | null): string {
  const line = (s: Sede) => `📍 ${SEDE_INFO[s].name}: ${SEDE_INFO[s].maps}`;
  if (share === "sede" && sede) return `\n\n${line(sede)}`;
  // "both", or "sede" without a resolved sede yet → send both, let the lead pick.
  if (share === "both" || share === "sede") {
    return `\n\n${line("FITNESS_CENTER")}\n${line("XTREME")}`;
  }
  return "";
}

export function agentEnabled(): boolean {
  return process.env.WHATSAPP_AGENT_ENABLED === "true";
}
function autoSendEnabled(): boolean {
  return process.env.WHATSAPP_AGENT_AUTOSEND === "true";
}

const VALID_STAGES: LeadStage[] = [
  "NEW", "CONTACTED", "SCHEDULED_TRIAL", "TRIAL_ATTENDED", "TRIAL_NO_SHOW",
  "NEGOTIATING", "CONVERTED", "LOST",
];

/**
 * Cuánto espera un handoff del bot antes de que el bot lo retome.
 *
 * Cuando el bot escala solo, se pausaba SIN fecha de vuelta y sin avisar a
 * nadie: el lead quedaba esperando indefinidamente (4 casos el 21 sep 2026, uno
 * de 37 horas). Ahora la pausa caduca — si en este plazo ninguna persona
 * contesta, el bot retoma y al menos el lead deja de estar en silencio.
 *
 * Si un humano SÍ entra, `sendManualMessage` limpia `botResumeAt` y la
 * conversación queda suya hasta que la devuelva.
 */
const HANDOFF_RESUME_MINUTES = Number(process.env.WHATSAPP_HANDOFF_RESUME_MINUTES ?? 60);

export type RunOutcome =
  | { status: "skipped"; reason: string }
  | { status: "drafted" }
  | { status: "sent" }
  | { status: "handoff"; sent: boolean }
  | { status: "error"; error: string };

/**
 * Generate + persist (and maybe send) the agent's reply for one conversation.
 * Safe to call unconditionally — it no-ops when the agent is disabled or paused.
 */
export async function respondToInboundConversation(
  conversationId: string,
  opts: { triggerMessageId?: string } = {},
): Promise<RunOutcome> {
  if (!agentEnabled()) return { status: "skipped", reason: "agent disabled" };

  // Let a burst settle, then answer it once (see DEBOUNCE_MS).
  if (DEBOUNCE_MS > 0) await sleep(DEBOUNCE_MS);

  if (opts.triggerMessageId) {
    const newest = await prisma.message.findFirst({
      where: { conversationId, direction: "INBOUND" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    // A newer message arrived while we waited: its own run will answer, and it
    // will see this message in the history. Standing down avoids a double reply.
    if (newest && newest.id !== opts.triggerMessageId) {
      return { status: "skipped", reason: "superseded by a newer inbound" };
    }
  }

  if (!(await claimAgentLock(conversationId))) {
    return { status: "skipped", reason: "another agent run holds this conversation" };
  }
  try {
    return await runLocked(conversationId);
  } finally {
    await releaseAgentLock(conversationId);
  }
}

/** The actual run. Called only while this process holds the conversation lock. */
async function runLocked(conversationId: string): Promise<RunOutcome> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      lead: { include: { member: { select: SOCIO_SELECT } } },
      member: { select: SOCIO_SELECT },
      messages: { orderBy: { createdAt: "asc" }, take: 30 },
    },
  });
  if (!conversation) return { status: "skipped", reason: "conversation not found" };

  // A human may have handed the conversation back with a timer ("devolver al bot
  // el lunes 8am"). If that moment has passed, the bot takes it from here — this
  // is the path that actually answers the lead who writes on a Saturday.
  if (conversation.botPaused && conversation.botResumeAt && conversation.botResumeAt <= new Date()) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { botPaused: false, botResumeAt: null },
    });
    conversation.botPaused = false;
    conversation.botResumeAt = null;
  }

  if (conversation.botPaused) return { status: "skipped", reason: "bot paused (human owns it)" };

  // Only reply if the most recent message is inbound (avoid replying to our own tail).
  const last = conversation.messages[conversation.messages.length - 1];
  if (!last || last.direction !== "INBOUND") {
    return { status: "skipped", reason: "last message is not inbound" };
  }

  // A socio (paying or paused) gets the socio mode, not the sales pitch — also
  // one who still writes from the conversation they had as a lead.
  const socio = socioOf(conversation);
  if (socio && memberModeEnabled()) return runMemberTurn(conversation, socio, { autoSend: autoSendEnabled() });
  if (socio && !conversation.leadId) return { status: "skipped", reason: "socio: modo socio apagado" };

  const history: AgentTurn[] = agentHistory(conversation.messages);
  const leadName = conversation.lead
    ? [conversation.lead.firstName, conversation.lead.lastName].filter(Boolean).join(" ") || null
    : null;

  // Ad the lead came from (headline on Lead; body only lives in the raw Message.referral).
  let adContext: string | null = null;
  if (conversation.lead?.adHeadline || conversation.lead?.adSourceId) {
    const refMsg = conversation.messages.find((m) => m.referral != null);
    const refBody = (refMsg?.referral as { body?: unknown } | null)?.body;
    adContext = adContextLine(conversation.lead, typeof refBody === "string" ? refBody : null);
  }

  // Someone inside their $9 trial: the agent helps them through it and closes,
  // never pitches the $9 again nor books a "first session".
  const trialContext = await trialContextFor(conversation.member ?? conversation.lead?.member ?? null);

  let result;
  try {
    result = await runAgent(history, { knownSede: null, leadName, adContext, trialContext });
  } catch (err) {
    console.error("[whatsapp-agent] runAgent failed", err);
    return { status: "error", error: err instanceof Error ? err.message : "agent error" };
  }

  const resolvedSede: Sede | null = result.sede === "UNKNOWN" ? null : (result.sede as Sede);
  // In the trial the funnel follows the gym (attendance, the plan they buy), not the chat:
  // a "NEGOTIATING" here would restart the no-reply cadence that pitches the $9.
  const stage: LeadStage | undefined = !trialContext && VALID_STAGES.includes(result.suggestedStage as LeadStage)
    ? (result.suggestedStage as LeadStage)
    : undefined;

  // Never send a blank message: if the model returned an empty reply, hand off to
  // a human with a safe holding message instead of pushing "" to WhatsApp.
  let replyText = (result.reply ?? "").trim();
  let forceHandoff = result.handoff;
  let guarded = false;
  if (!replyText) {
    console.warn("[whatsapp-agent] empty reply from model; handing off");
    replyText = "¡Gracias por escribir! 😊 En un momento un asesor te atiende.";
    forceHandoff = true;
  }

  // Guardas en código (ver guards.ts): el prompt ya pedía ambas cosas y el
  // modelo igual las ignoró con Ibeth el 23 sep.
  const lastOutboundIdx = conversation.messages.findLastIndex((m) => m.direction === "OUTBOUND");
  const burst = conversation.messages
    .slice(lastOutboundIdx + 1)
    .filter((m) => m.direction === "INBOUND")
    .map((m) => m.body);
  const botTail = conversation.messages.filter((m) => m.direction === "OUTBOUND").slice(-2);
  const botOnlyTail = botTail.every((m) => m.llmGenerated && !m.sentByUserId);
  const guardName = conversation.lead ? templateName(conversation.lead.firstName) : null;
  const shortName = guardName && guardName !== "qué tal" ? guardName : null;
  if (asksForHuman(burst)) {
    replyText = handoffReply("asked", shortName);
    forceHandoff = true;
    guarded = true;
  } else if (botOnlyTail && isThirdRepeat(replyText, botTail.map((m) => m.body))) {
    console.warn("[whatsapp-agent] same question a third time; handing off", { conversationId });
    replyText = handoffReply("repeat", shortName);
    forceHandoff = true;
    guarded = true;
  }
  const finalReply = guarded ? replyText : replyText + locationSuffix(result.shareLocation, resolvedSede);

  // Persist the draft reply + lead updates in one transaction.
  const draft = await prisma.$transaction(async (tx) => {
    if (conversation.leadId) {
      await tx.lead.update({
        where: { id: conversation.leadId },
        data: {
          ...(stage ? { stage } : {}),
          ...(resolvedSede ? { sede: resolvedSede } : {}),
          // Capture the goal once, without clobbering admin-written notes.
          ...(result.objetivo && !conversation.lead?.notes
            ? { notes: `Objetivo (agente): ${result.objetivo}` }
            : {}),
        },
      });
    }
    if (resolvedSede && resolvedSede !== conversation.sede) {
      await tx.conversation.update({ where: { id: conversation.id }, data: { sede: resolvedSede } });
    }
    if (forceHandoff) {
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          botPaused: true,
          botResumeAt: new Date(Date.now() + HANDOFF_RESUME_MINUTES * 60 * 1000),
        },
      });
    }
    return tx.message.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        channel: "WHATSAPP",
        body: finalReply,
        llmGenerated: true,
        // sentByUserId + externalId stay null: this is a bot draft until sent.
        // Flipped to SENT/FAILED below if we actually attempt a send.
        sendStatus: "DRAFT",
      },
    });
  });

  // Avisar a quien atiende el inbox. Fuera de la transacción y sin await sobre su
  // error: que falle un push no puede tumbar la respuesta al lead.
  if (forceHandoff) {
    const lastInbound = [...conversation.messages].reverse().find((m) => m.direction === "INBOUND");
    await notifyStaffOfBotHandoff({
      leadName: leadName ?? "Lead sin nombre",
      sede: resolvedSede ?? conversation.sede,
      lastMessage: lastInbound?.body ?? null,
    }).catch((err) => {
      console.error("[whatsapp-agent] no se pudo avisar del handoff", err);
    });
  }

  // "Escríbeme después del 5 de noviembre": stop the cadence and leave a task for
  // that day instead (postpone.ts). Done before sending — the request stands even
  // if our reply doesn't go out.
  const postponeUntil =
    conversation.lead && !trialContext && !result.scheduledAtISO && stage !== "LOST" && stage !== "CONVERTED"
      ? parsePostponeDate(result.contactarDesde)
      : null;
  if (postponeUntil && conversation.lead) {
    await cancelNoReplyCadence(conversation.id, `el lead pidió que le escribamos el ${postponeUntil.toISOString().slice(0, 10)}`)
      .catch((err) => console.error("[whatsapp-agent] no se pudo cortar la cadencia", err));
    const said = burst.join(" / ") || null;
    await createPostponeTask(
      { ...conversation.lead, sede: resolvedSede ?? conversation.lead.sede },
      postponeUntil,
      said,
    );
  }

  // If the agent booked an evaluation, record it and schedule anti-no-show reminders.
  if (result.scheduledAtISO && !trialContext) {
    const when = new Date(result.scheduledAtISO);
    if (!isNaN(when.getTime()) && when.getTime() > Date.now()) {
      if (conversation.leadId) {
        await prisma.lead.update({
          where: { id: conversation.leadId },
          data: { trialScheduledAt: when, stage: "SCHEDULED_TRIAL" },
        });
      }
      await scheduleTrialReminders(
        conversation.id,
        when,
        conversation.lead?.firstName ?? null,
        resolvedSede ?? conversation.sede,
      );
      if (conversation.leadId) await closePostponeTasks(conversation.leadId, "Agendó su primera sesión por WhatsApp con el agente.");
    }
  }

  // Send only when auto-send is on and we're inside the 24h service window.
  const withinWindow =
    conversation.lastInboundAt != null &&
    Date.now() - new Date(conversation.lastInboundAt).getTime() < WINDOW_MS;

  if (!autoSendEnabled() || !withinWindow) {
    return forceHandoff ? { status: "handoff", sent: false } : { status: "drafted" };
  }

  try {
    const sent = await sendText(conversation.externalId, finalReply);
    await prisma.$transaction([
      prisma.message.update({
        where: { id: draft.id },
        data: { externalId: sent.messageId, sendStatus: "SENT", sendAttemptedAt: new Date() },
      }),
      prisma.conversation.update({ where: { id: conversation.id }, data: { lastOutboundAt: new Date() } }),
    ]);
    await followUpIfSilent(conversation, {
      handoff: forceHandoff,
      booked: result.scheduledAtISO != null && !trialContext,
      postponed: postponeUntil != null,
      stage: stage ?? conversation.lead?.stage ?? null,
    });
    return forceHandoff ? { status: "handoff", sent: true } : { status: "sent" };
  } catch (err) {
    const summary = describeSendError(err);
    console.error("[whatsapp-agent] send failed; message marked FAILED", {
      conversationId: conversation.id,
      messageId: draft.id,
      error: summary,
    });
    // Persist the failure on the row so staff see "No entregado" in the inbox.
    // Best-effort: a DB hiccup here must not throw into the webhook's after().
    try {
      await prisma.message.update({
        where: { id: draft.id },
        data: { sendStatus: "FAILED", sendError: summary, sendAttemptedAt: new Date() },
      });
    } catch (dbErr) {
      console.error("[whatsapp-agent] could not persist send failure", dbErr);
    }
    return { status: "error", error: err instanceof Error ? err.message : "send error" };
  }
}

/**
 * After a sent reply: (re)start the no-reply cadence, or stop it when the lead
 * booked, asked for a person or left the funnel. Never throws — the reply
 * already went out.
 */
async function followUpIfSilent(
  conversation: { id: string; lastInboundAt: Date | null; lead: { firstName: string | null; lastName: string | null } | null },
  outcome: { handoff: boolean; booked: boolean; postponed: boolean; stage: LeadStage | null },
): Promise<void> {
  try {
    // Postponed: the cadence was already canceled and the task for that day is the only follow-up.
    if (outcome.postponed) return;
    const open = outcome.stage === "NEW" || outcome.stage === "CONTACTED" || outcome.stage === "NEGOTIATING";
    if (!conversation.lead || outcome.handoff || outcome.booked || !open) {
      await cancelNoReplyCadence(conversation.id, outcome.handoff ? "pasó a una persona" : `etapa ${outcome.stage ?? "?"}`);
      return;
    }
    await scheduleNoReplyCadence(conversation.id, {
      sentAt: new Date(),
      lastInboundAt: conversation.lastInboundAt,
      firstName: conversation.lead.firstName,
      lastName: conversation.lead.lastName,
    });
  } catch (err) {
    console.error("[whatsapp-agent] no se pudo programar el seguimiento", { conversationId: conversation.id, err });
  }
}

/**
 * The trial context for the agent, or null if this person is not inside an
 * active $9 trial. Never throws: without it the agent still answers.
 */
async function trialContextFor(member: { id: string; status: string } | null): Promise<string | null> {
  if (!member || member.status !== "TRIAL") return null;
  try {
    const now = new Date();
    const trial = await prisma.membership.findFirst({
      where: { memberId: member.id, state: "ACTIVE", plan: { billingCycle: "TRIAL" }, startsAt: { lte: now }, endsAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      orderBy: { startsAt: "desc" },
      select: { startsAt: true, endsAt: true },
    });
    if (!trial) return null;
    const startDay = ecuadorDateString(trial.startsAt);
    const visits = await prisma.attendance.findMany({
      where: { memberId: member.id, recordedAt: { gte: new Date(trial.startsAt.getTime() - 24 * 60 * 60 * 1000) } },
      select: { recordedAt: true },
    });
    const days = new Set(visits.map((v) => ecuadorDateString(v.recordedAt)).filter((d) => d >= startDay));
    return trialAgentContext({ startDay, endDay: ecuadorDateString(trial.endsAt), today: ecuadorDateString(now), visits: days.size });
  } catch (err) {
    console.error("[whatsapp-agent] no se pudo leer la prueba del socio", member.id, err);
    return null;
  }
}
