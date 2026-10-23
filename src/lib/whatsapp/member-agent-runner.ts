// One agent turn for a socio (see member-mode.ts). Called by agent-runner while
// it holds the conversation lock, after the pause and last-inbound checks.
//
// Differences with the sales path: no lead stage, no $9, no no-reply cadence.
//
// Santiago (23 oct 2026): "we cannot not answer them". A socio who tells us why
// they stopped coming always gets an empathetic answer from the agent AND a task
// for a person to follow up — one open task per socio, updated as they write
// more. A handoff (injury, money, complaint, asks for a person) no longer pauses
// the bot: it keeps the conversation warm until someone from the team writes,
// and that manual message is what pauses it (sendManualMessage). Only a bot that
// is repeating itself steps aside on its own.

import { prisma } from "@/lib/prisma";
import type { Message, Sede } from "@/generated/prisma/client";
import { runMemberAgent, type MemberAgentResult, type MemberHandoffReason } from "./agent";
import { sendText, describeSendError } from "./client";
import { agentHistory } from "./history";
import { asksForHuman, handoffReply, isThirdRepeat, memberHandoffReply, memberNeedsPerson, memberReplyIsSafe } from "./guards";
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
  const openTask = await openFollowupTask(socio.id);

  let result;
  try {
    result = await runMemberAgent(agentHistory(conversation.messages), {
      firstName: name,
      sede: socio.sede,
      daysSinceLastVisit: days.length ? daysBetween(days[0], ecuadorDateString(now)) : null,
      rhythm: rhythm ? describeRhythm(rhythm) : null,
      pendingFollowup: openTask?.title ?? null,
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

  const modelReply = (result.reply ?? "").trim();
  let reply = modelReply;
  let reason: MemberHandoffReason | "repeat" | null = result.handoff ? (result.handoffReason === "ninguno" ? "persona" : result.handoffReason) : null;
  const topic = memberNeedsPerson(burstTexts);
  // The model's own words when it saw the same thing we did and stayed in its
  // lane (no diagnosis, no money, names who writes); the fixed line otherwise.
  const ownWordsOr = (r: MemberHandoffReason) => (result.handoff && memberReplyIsSafe(modelReply, r) ? modelReply : memberHandoffReply(r, name));
  if (asksForHuman(burstTexts)) {
    reason = "persona";
    reply = ownWordsOr("persona");
  } else if (topic) {
    // Even if the model didn't flag it: a knee or a charge always goes to a person.
    reason = topic;
    reply = ownWordsOr(topic);
  } else if (!reply) {
    reason = "persona";
    reply = memberHandoffReply("persona", name);
  } else if (botOnlyTail && isThirdRepeat(reply, botTail.map((m) => m.body))) {
    reason = "repeat";
    reply = handoffReply("repeat", name);
  } else if (reason && !memberReplyIsSafe(reply, reason)) {
    reply = memberHandoffReply(reason, name);
  }
  const handoff = reason !== null;

  const draft = await prisma.$transaction(async (tx) => {
    // Only a looping bot steps aside by itself; every other handoff keeps
    // answering until a person writes (their message pauses the bot).
    if (reason === "repeat") {
      await tx.conversation.update({ where: { id: conversation.id }, data: { botPaused: true, botResumeAt: null } });
    }
    return tx.message.create({
      data: { conversationId: conversation.id, direction: "OUTBOUND", channel: "WHATSAPP", body: reply, llmGenerated: true, sendStatus: "DRAFT" },
    });
  });

  // A socio who came in as a lead may still have the lead's no-reply cadence queued.
  if (conversation.leadId) await cancelNoReplyCadence(conversation.id, "es socio").catch(() => undefined);

  const trigger = burst.at(-1) ?? null;
  // A person follows up on anything that isn't small talk: a reason for not
  // coming, a return day, or a topic only a person handles.
  if (handoff || result.causa !== "ninguna" || result.vuelve) {
    const created = await followupTask(socio, openTask, { reason, causa: result.causa, vuelve: result.vuelve, trigger, burst, reply }).catch((err) => {
      console.error("[whatsapp-agent] no se pudo crear/actualizar la tarea del socio", err);
      return false;
    });
    // Push once, when a person is newly needed — not on every message after.
    if (handoff && (created || (openTask?.priority ?? 0) < 1)) {
      await notifyStaffOfBotHandoff({ leadName: `${socio.firstName} ${socio.lastName ?? ""}`.trim() + " (socio)", sede: socio.sede, lastMessage: trigger?.body ?? null }).catch((err) =>
        console.error("[whatsapp-agent] no se pudo avisar del handoff del socio", err),
      );
    }
  }
  if (result.vuelve) await noteReturnDay(socio.id, result.vuelve).catch(() => undefined);

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

const CAUSA_LABEL: Record<MemberAgentResult["causa"], string> = {
  tiempo: "falta de tiempo u horario",
  resultados: "no ve resultados",
  motivacion: "desmotivación",
  viaje_enfermedad: "viaje o enfermedad",
  lesion: "lesión o dolor",
  dinero: "tema de dinero",
  otra: "otra razón",
  ninguna: "seguimiento",
};

type OpenTask = { id: string; title: string; priority: number };

/** The socio's open follow-up task from the agent, if any (one at a time). */
async function openFollowupTask(memberId: string): Promise<OpenTask | null> {
  return prisma.staffTask.findFirst({
    where: {
      memberId,
      OR: [{ autoKey: { startsWith: "socio-handoff:" } }, { autoKey: { startsWith: "socio-seguimiento:" } }],
      status: { in: ["TODO", "IN_PROGRESS", "WAITING"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, priority: true },
  });
}

const clip = (t: string, n: number) => t.replace(/\s+/g, " ").trim().slice(0, n);

/**
 * One task per socio for a person to follow up, in the sede's pool (Recepción and
 * the Resumen). A new message lands on the open task as an entry instead of a
 * second task; a handoff raises it to priority 1. Returns true when it created one.
 */
async function followupTask(
  socio: SocioRef,
  open: OpenTask | null,
  turn: {
    reason: MemberHandoffReason | "repeat" | null;
    causa: MemberAgentResult["causa"];
    vuelve: string | null;
    trigger: Message | null;
    burst: Message[];
    reply: string;
  },
): Promise<boolean> {
  const fullName = `${socio.firstName} ${socio.lastName ?? ""}`.replace(/\s+/g, " ").trim();
  const said = clip(turn.burst.map((m) => m.body).join(" / "), 300);
  const what = turn.reason ? HANDOFF_LABEL[turn.reason] : CAUSA_LABEL[turn.causa];
  const entry =
    (said ? `Escribió: «${said}». ` : "") +
    `El bot le respondió: «${clip(turn.reply, 300)}».` +
    (turn.vuelve ? ` Dice que vuelve: «${turn.vuelve}».` : "");

  if (open) {
    await prisma.$transaction(async (tx) => {
      if (turn.reason && open.priority < 1) {
        await tx.staffTask.update({ where: { id: open.id }, data: { priority: 1, title: `Responder a ${fullName} por WhatsApp: ${what}` } });
      }
      await tx.staffTaskEntry.create({ data: { taskId: open.id, kind: "EVENT", body: entry } });
    });
    return false;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const t = await tx.staffTask.create({
        data: {
          // One per inbound burst: a retry of the same run never duplicates it.
          autoKey: `${turn.reason ? "socio-handoff" : "socio-seguimiento"}:${turn.trigger?.id ?? `${socio.id}:${Date.now()}`}`,
          title: turn.reason ? `Responder a ${fullName} por WhatsApp: ${what}` : `Dar seguimiento a ${fullName} (WhatsApp): ${what}`,
          detail:
            entry +
            " El bot sigue atendiendo la conversación hasta que alguien del equipo le escriba; tu mensaje desde su ficha o Comunicación lo pausa." +
            (turn.reason === "lesion" ? " Que lo vea su coach para adaptar la rutina." : ""),
          type: "WHATSAPP",
          priority: turn.reason ? 1 : 0,
          sede: socio.sede,
          memberId: socio.id,
          dueDate: todayDateUtc(),
        },
      });
      await tx.staffTaskEntry.create({ data: { taskId: t.id, kind: "EVENT", body: "La creó el agente de WhatsApp (modo socio)." } });
    });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    return false;
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
