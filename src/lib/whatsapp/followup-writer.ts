/**
 * Writes the free-text nudges for a lead who stopped answering.
 *
 * The first two touches of the no-reply cadence go out inside Meta's 24h window,
 * so they are free and can pick up what the lead actually said instead of a
 * canned line ("la otra vez me contaste que…"). The agent writes them with the
 * same persona and selling rules it uses to reply (agent.ts, "Cómo vendes").
 *
 * Returns null when the agent decides not to write (the lead already said no) or
 * the call fails; the caller then falls back to the fixed text it scheduled.
 */

import { prisma } from "@/lib/prisma";
import { runAgent, type FollowupStep } from "./agent";
import { agentHistory } from "./history";

export async function writeNoReplyNudge(
  conversationId: string,
  step: FollowupStep["step"],
): Promise<{ text: string } | { skip: true } | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { lead: true, messages: { orderBy: { createdAt: "desc" }, take: 30 } },
  });
  if (!conversation) return null;
  const messages = [...conversation.messages].reverse();
  const lastOutbound = messages.findLast((m) => m.direction === "OUTBOUND");
  if (!lastOutbound) return null;

  const hoursSilent = Math.max(1, Math.round((Date.now() - lastOutbound.createdAt.getTime()) / 3_600_000));
  const leadName = conversation.lead
    ? [conversation.lead.firstName, conversation.lead.lastName].filter(Boolean).join(" ") || null
    : null;

  try {
    const result = await runAgent(agentHistory(messages), {
      knownSede: null,
      leadName,
      followup: { step, hoursSilent },
    });
    const text = (result.reply ?? "").trim();
    // An empty reply is the agent's way of saying "this lead asked us to stop".
    if (!text || result.suggestedStage === "LOST") return { skip: true };
    return { text };
  } catch (err) {
    console.error("[followups] no se pudo redactar el seguimiento", conversationId, err);
    return null;
  }
}
