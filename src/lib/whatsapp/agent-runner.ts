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
import { scheduleTrialReminders } from "./sequences";
import { adContextLine } from "./referral";

const WINDOW_MS = 24 * 60 * 60 * 1000;

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
export async function respondToInboundConversation(conversationId: string): Promise<RunOutcome> {
  if (!agentEnabled()) return { status: "skipped", reason: "agent disabled" };

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      lead: true,
      messages: { orderBy: { createdAt: "asc" }, take: 30 },
    },
  });
  if (!conversation) return { status: "skipped", reason: "conversation not found" };
  if (conversation.botPaused) return { status: "skipped", reason: "bot paused (human owns it)" };

  // Only reply if the most recent message is inbound (avoid replying to our own tail).
  const last = conversation.messages[conversation.messages.length - 1];
  if (!last || last.direction !== "INBOUND") {
    return { status: "skipped", reason: "last message is not inbound" };
  }

  const history: AgentTurn[] = conversation.messages.map((m) => ({
    role: m.direction === "INBOUND" ? "user" : "assistant",
    text: m.body,
  }));
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

  let result;
  try {
    result = await runAgent(history, { knownSede: null, leadName, adContext });
  } catch (err) {
    console.error("[whatsapp-agent] runAgent failed", err);
    return { status: "error", error: err instanceof Error ? err.message : "agent error" };
  }

  const resolvedSede: Sede | null = result.sede === "UNKNOWN" ? null : (result.sede as Sede);
  const stage: LeadStage | undefined = VALID_STAGES.includes(result.suggestedStage as LeadStage)
    ? (result.suggestedStage as LeadStage)
    : undefined;

  // Never send a blank message: if the model returned an empty reply, hand off to
  // a human with a safe holding message instead of pushing "" to WhatsApp.
  let replyText = (result.reply ?? "").trim();
  let forceHandoff = result.handoff;
  if (!replyText) {
    console.warn("[whatsapp-agent] empty reply from model; handing off");
    replyText = "¡Gracias por escribir! 😊 En un momento un asesor te atiende.";
    forceHandoff = true;
  }
  const finalReply = replyText + locationSuffix(result.shareLocation, resolvedSede);

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
      await tx.conversation.update({ where: { id: conversation.id }, data: { botPaused: true } });
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

  // If the agent booked an evaluation, record it and schedule anti-no-show reminders.
  if (result.scheduledAtISO) {
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
