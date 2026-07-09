/**
 * Agent runner — bridges the pure agent (agent.ts) to the DB + WhatsApp.
 *
 * Called AFTER the webhook has acked Meta (via `after()` in the route), so the
 * Claude round-trip never delays the 200. It loads the conversation, asks the
 * agent for a reply + qualification, persists the reply as an OUTBOUND Message,
 * updates the Lead (stage/sede), and — only when auto-send is enabled and we're
 * inside Meta's 24h window — actually sends it. With auto-send off, the reply is
 * stored as a DRAFT (llmGenerated, no externalId, never sent) for staff to review.
 */

import { prisma } from "@/lib/prisma";
import type { LeadStage, Sede } from "@/generated/prisma/client";
import { runAgent, type AgentTurn } from "./agent";
import { sendText } from "./client";
import { scheduleTrialReminders } from "./sequences";

const WINDOW_MS = 24 * 60 * 60 * 1000;

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

  let result;
  try {
    result = await runAgent(history, { knownSede: null, leadName });
  } catch (err) {
    console.error("[whatsapp-agent] runAgent failed", err);
    return { status: "error", error: err instanceof Error ? err.message : "agent error" };
  }

  const resolvedSede: Sede | null = result.sede === "UNKNOWN" ? null : (result.sede as Sede);
  const stage: LeadStage | undefined = VALID_STAGES.includes(result.suggestedStage as LeadStage)
    ? (result.suggestedStage as LeadStage)
    : undefined;

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
    if (result.handoff) {
      await tx.conversation.update({ where: { id: conversation.id }, data: { botPaused: true } });
    }
    return tx.message.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        channel: "WHATSAPP",
        body: result.reply,
        llmGenerated: true,
        // sentByUserId + externalId stay null: this is a bot draft until sent.
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
    return result.handoff ? { status: "handoff", sent: false } : { status: "drafted" };
  }

  try {
    const sent = await sendText(conversation.externalId, result.reply);
    await prisma.$transaction([
      prisma.message.update({ where: { id: draft.id }, data: { externalId: sent.messageId } }),
      prisma.conversation.update({ where: { id: conversation.id }, data: { lastOutboundAt: new Date() } }),
    ]);
    return result.handoff ? { status: "handoff", sent: true } : { status: "sent" };
  } catch (err) {
    console.error("[whatsapp-agent] send failed; reply left as draft", err);
    return { status: "error", error: err instanceof Error ? err.message : "send error" };
  }
}
