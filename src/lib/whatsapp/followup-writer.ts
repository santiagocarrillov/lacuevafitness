/**
 * Writes the free-text nudges for a lead who stopped answering.
 *
 * The first two touches of the no-reply cadence go out inside Meta's 24h window,
 * so they are free and can pick up what the lead actually said instead of a
 * canned line ("la otra vez me contaste que…"). The agent writes them with the
 * same persona and selling rules it uses to reply (agent.ts, "Cómo vendes").
 *
 * The second touch gets an angle picked per conversation (pickNudgeAngle) so the
 * leads don't all get the same message, and every draft goes through nudgeIssues:
 * one that still asks "¿Fitness o Xtreme?" or reuses a worn-out line is rewritten
 * once, and if it still fails the caller sends its fixed text.
 *
 * Returns null when the call fails or the draft can't be fixed (the caller then
 * falls back to the fixed text it scheduled), { skip } when the lead already said
 * no, and { postpone } when the lead had asked us to write on a later date.
 */

import { prisma } from "@/lib/prisma";
import { nudgeIssues, pickNudgeAngle, runAgent, type FollowupStep } from "./agent";
import { agentHistory } from "./history";
import { parsePostponeDate } from "./postpone";

export type NudgeResult = { text: string } | { skip: true } | { postpone: Date; said: string | null } | null;

export async function writeNoReplyNudge(conversationId: string, step: FollowupStep["step"]): Promise<NudgeResult> {
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
  const angle = step === 2 ? pickNudgeAngle(conversationId) : undefined;

  try {
    let avoid: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await runAgent(agentHistory(messages), {
        knownSede: null,
        leadName,
        followup: { step, hoursSilent, angle, avoid },
      });
      const postpone = parsePostponeDate(result.contactarDesde);
      if (postpone) {
        const said = messages.findLast((m) => m.direction === "INBOUND")?.body ?? null;
        return { postpone, said };
      }
      const text = (result.reply ?? "").trim();
      // An empty reply is the agent's way of saying "this lead asked us to stop".
      if (!text || result.suggestedStage === "LOST") return { skip: true };
      avoid = nudgeIssues(text, step);
      if (avoid.length === 0) return { text };
      console.warn("[followups] seguimiento descartado", { conversationId, step, avoid });
    }
    return null;
  } catch (err) {
    console.error("[followups] no se pudo redactar el seguimiento", conversationId, err);
    return null;
  }
}
