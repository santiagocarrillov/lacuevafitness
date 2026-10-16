// One agent turn for a socio (see member-mode.ts). Called by agent-runner while
// it holds the conversation lock, after the pause and last-inbound checks.
//
// Differences with the sales path: no lead stage, no $9, no no-reply cadence; a
// handoff (injury, money, complaint, asks for a person) pauses the bot with no
// timer — a person owns it until they hand it back — and leaves a task for the
// sede so it can't get lost in the inbox.

import { prisma } from "@/lib/prisma";
import type { Message, Sede } from "@/generated/prisma/client";
import { runMemberAgent, type MemberHandoffReason } from "./agent";
import { sendText, describeSendError } from "./client";
import { agentHistory } from "./history";
import { asksForHuman, handoffReply, isThirdRepeat, memberHandoffReply, memberNeedsPerson } from "./guards";
import { cancelNoReplyCadence } from "./sequences";
import { templateName } from "./templates";
import { describeRhythm, memberRhythm, daysBetween } from "./absence-rhythm";
import { notifyStaffOfBotHandoff } from "@/lib/push/notify-staff";
import { ecuadorDateString, todayDateUtc } from "@/lib/timezone";
import type { SocioRef } from "./member-mode";
import type { RunOutcome } from "./agent-runner";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const DAY = 86_400_000;

const HANDOFF_LABEL: Record<MemberHandoffReason | "repeat", string> = {
  lesion: "lesión o dolor (que lo vea su coach)",
  cobro: "cobro, pago o plan",
  reclamo: "reclamo",
  persona: "pidió hablar con una persona",
  no_se: "pregunta que el bot no sabe",
  repeat: "el bot se estaba repitiendo",
};

type Conv = {
  id: string;
  sede: Sede;
  externalId: string;
  leadId: string | null;
  lastInboundAt: Date | null;
  messages: Message[];
};

export async function runMemberTurn(conversation: Conv, socio: SocioRef, opts: { autoSend: boolean }): Promise<RunOutcome> {
  const now = new Date();
  const visits = await prisma.attendance.findMany({
    where: { memberId: socio.id },
    orderBy: { recordedAt: "desc" },
    take: 40,
    select: { recordedAt: true },
  });
  const days = visits.map((v) => ecuadorDateString(v.recordedAt));
  const rhythm = memberRhythm(days, ecuadorDateString(socio.joinedAt));
  const shortName = templateName(socio.firstName, socio.lastName);
  const name = shortName && shortName !== "qué tal" ? shortName : null;

  let result;
  try {
    result = await runMemberAgent(agentHistory(conversation.messages), {
      firstName: name,
      sede: socio.sede,
      daysSinceLastVisit: days.length ? daysBetween(days[0], ecuadorDateString(now)) : null,
      rhythm: rhythm ? describeRhythm(rhythm) : null,
    });
  } catch (err) {
    console.error("[whatsapp-agent] runMemberAgent failed", err);
    return { status: "error", error: err instanceof Error ? err.message : "agent error" };
  }

  // Code guards first: the prompt asks for all of this, the code makes sure.
  const lastOutboundIdx = conversation.messages.findLastIndex((m) => m.direction === "OUTBOUND");
  const burst = conversation.messages.slice(lastOutboundIdx + 1).filter((m) => m.direction === "INBOUND");
  const burstTexts = burst.map((m) => m.body);
  const botTail = conversation.messages.filter((m) => m.direction === "OUTBOUND").slice(-2);
  const botOnlyTail = botTail.every((m) => m.llmGenerated && !m.sentByUserId);

  let reply = (result.reply ?? "").trim();
  let reason: MemberHandoffReason | "repeat" | null = result.handoff ? (result.handoffReason === "ninguno" ? "persona" : result.handoffReason) : null;
  const topic = memberNeedsPerson(burstTexts);
  if (asksForHuman(burstTexts)) {
    reason = "persona";
    reply = memberHandoffReply("persona", name);
  } else if (topic) {
    // Even if the model answered it: a bot doesn't talk about a knee or a charge.
    reason = topic;
    reply = memberHandoffReply(topic, name);
  } else if (!reply) {
    reason = "persona";
    reply = memberHandoffReply("persona", name);
  } else if (botOnlyTail && isThirdRepeat(reply, botTail.map((m) => m.body))) {
    reason = "repeat";
    reply = handoffReply("repeat", name);
  }
  const handoff = reason !== null;

  const draft = await prisma.$transaction(async (tx) => {
    if (handoff) {
      await tx.conversation.update({ where: { id: conversation.id }, data: { botPaused: true, botResumeAt: null } });
    }
    return tx.message.create({
      data: { conversationId: conversation.id, direction: "OUTBOUND", channel: "WHATSAPP", body: reply, llmGenerated: true, sendStatus: "DRAFT" },
    });
  });

  // A socio who came in as a lead may still have the lead's no-reply cadence queued.
  if (conversation.leadId) await cancelNoReplyCadence(conversation.id, "es socio").catch(() => undefined);

  const trigger = burst.at(-1);
  if (handoff) {
    await notifyStaffOfBotHandoff({ leadName: `${socio.firstName} ${socio.lastName ?? ""}`.trim() + " (socio)", sede: socio.sede, lastMessage: trigger?.body ?? null }).catch((err) =>
      console.error("[whatsapp-agent] no se pudo avisar del handoff del socio", err),
    );
    await handoffTask(socio, reason!, trigger ?? null).catch((err) => console.error("[whatsapp-agent] no se pudo crear la tarea del handoff", err));
  } else if (result.vuelve) {
    await noteReturnDay(socio.id, result.vuelve).catch(() => undefined);
  }

  const withinWindow = conversation.lastInboundAt != null && now.getTime() - conversation.lastInboundAt.getTime() < WINDOW_MS;
  if (!opts.autoSend || !withinWindow) return handoff ? { status: "handoff", sent: false } : { status: "drafted" };

  try {
    const sent = await sendText(conversation.externalId, reply);
    await prisma.$transaction([
      prisma.message.update({ where: { id: draft.id }, data: { externalId: sent.messageId, sendStatus: "SENT", sendAttemptedAt: new Date() } }),
      prisma.conversation.update({ where: { id: conversation.id }, data: { lastOutboundAt: new Date() } }),
    ]);
    return handoff ? { status: "handoff", sent: true } : { status: "sent" };
  } catch (err) {
    const summary = describeSendError(err);
    console.error("[whatsapp-agent] socio send failed; message marked FAILED", { conversationId: conversation.id, error: summary });
    await prisma.message
      .update({ where: { id: draft.id }, data: { sendStatus: "FAILED", sendError: summary, sendAttemptedAt: new Date() } })
      .catch(() => undefined);
    return { status: "error", error: err instanceof Error ? err.message : "send error" };
  }
}

/** The handoff as a task in the sede's pool, so it shows in Recepción and the Resumen. */
async function handoffTask(socio: SocioRef, reason: MemberHandoffReason | "repeat", trigger: Message | null): Promise<void> {
  const fullName = `${socio.firstName} ${socio.lastName ?? ""}`.replace(/\s+/g, " ").trim();
  const snippet = trigger?.body?.replace(/\s+/g, " ").trim().slice(0, 200);
  try {
    await prisma.$transaction(async (tx) => {
      const t = await tx.staffTask.create({
        data: {
          // One per inbound burst: a retry of the same run never duplicates it.
          autoKey: `socio-handoff:${trigger?.id ?? `${socio.id}:${Date.now()}`}`,
          title: `Responder a ${fullName} por WhatsApp: ${HANDOFF_LABEL[reason]}`,
          detail:
            (snippet ? `Escribió: «${snippet}». ` : "") +
            "El bot le dijo que una persona le escribe y quedó en pausa. Contéstale desde su ficha o Comunicación; " +
            "cuando termines, puedes devolver la conversación al bot.",
          type: "WHATSAPP",
          priority: 1,
          sede: socio.sede,
          memberId: socio.id,
          dueDate: todayDateUtc(),
        },
      });
      await tx.staffTaskEntry.create({ data: { taskId: t.id, kind: "EVENT", body: "La creó el agente de WhatsApp (modo socio)." } });
    });
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
  }
}

/** "Vuelvo el lunes" lands on the open absence task, so whoever has it knows. */
async function noteReturnDay(memberId: string, vuelve: string): Promise<void> {
  const open = await prisma.staffTask.findMany({
    where: { memberId, autoKey: { startsWith: "inactive" }, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, createdAt: { gte: new Date(Date.now() - 31 * DAY) } },
    select: { id: true },
  });
  for (const t of open) {
    await prisma.staffTaskEntry.create({ data: { taskId: t.id, kind: "EVENT", body: `Le dijo al agente de WhatsApp que vuelve: «${vuelve}».` } });
  }
}
