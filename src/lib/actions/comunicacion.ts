"use server";

/**
 * Comunicación (Inbox) — Fase 1.
 *
 * Server actions for the shared WhatsApp inbox: list conversations, open a
 * thread, assign leads to staff, take over from the bot, reply manually, and
 * hand the conversation back to the agent.
 *
 * Visibility: "todos ven todo" — any lead-managing staff (OWNER/ACCOUNTING/ADMIN)
 * sees every conversation on the shared number, regardless of sede.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import { sendText } from "@/lib/whatsapp/client";
import { resolveResumeAt, type ResumePreset } from "@/lib/whatsapp/bot-handoff";
import type { LeadStage, MessageDirection, Prisma, Sede } from "@/generated/prisma/client";

const WINDOW_MS = 24 * 60 * 60 * 1000;

async function requireInboxAccess() {
  const user = await requireAuth();
  if (!can.manageLeads(user)) {
    throw new Error("No tienes permiso para el centro de comunicación.");
  }
  return user;
}

export type InboxFilter = "all" | "unassigned" | "mine" | "waiting";

export type ConversationRow = {
  id: string;
  leadId: string;
  sede: Sede;
  botPaused: boolean;
  /** ISO time when the bot takes this conversation back on its own, or null. */
  botResumeAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  leadName: string;
  leadPhone: string | null;
  stage: LeadStage;
  ownerUserId: string | null;
  ownerName: string | null;
  lastMessageBody: string | null;
  lastMessageDirection: MessageDirection | null;
  /** Last message is an outbound that WhatsApp rejected (Message.sendStatus = "FAILED"). */
  lastMessageFailed: boolean;
  /** Customer wrote last and nobody has replied → needs attention. */
  needsAttention: boolean;
  /** WhatsApp 24h service window still open (free-text replies allowed). */
  windowOpen: boolean;
};

/**
 * "Esperando a una persona": el bot está en pausa y el último que habló fue el
 * lead. Es justo el hueco que dejaba el handoff automático — el bot decía "un
 * asesor te atiende", se pausaba, y nadie sabía que esa conversación existía.
 * El 21 sep 2026 había 4 así, la más vieja de 37 horas.
 */
function waitingForHuman(): Prisma.ConversationWhereInput {
  return {
    botPaused: true,
    lastInboundAt: { not: null },
    OR: [
      { lastOutboundAt: null },
      { lastOutboundAt: { lt: prisma.conversation.fields.lastInboundAt } },
    ],
  };
}

/** Cuántas conversaciones están esperando a que alguien las tome. */
export async function countWaitingForHuman(): Promise<number> {
  await requireInboxAccess();
  return prisma.conversation.count({ where: waitingForHuman() });
}

/** List conversations for the shared inbox, newest activity first. */
export async function getConversations(filter: InboxFilter = "all"): Promise<ConversationRow[]> {
  const user = await requireInboxAccess();

  const leadWhere =
    filter === "unassigned"
      ? { ownerUserId: null }
      : filter === "mine"
        ? { ownerUserId: user.id }
        : {};

  const conversations = await prisma.conversation.findMany({
    where: { lead: { is: leadWhere }, ...(filter === "waiting" ? waitingForHuman() : {}) },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      lead: { include: { owner: { select: { fullName: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const now = Date.now();
  return conversations.map((c) => {
    const last = c.messages[0] ?? null;
    const inboundMs = c.lastInboundAt ? new Date(c.lastInboundAt).getTime() : 0;
    const outboundMs = c.lastOutboundAt ? new Date(c.lastOutboundAt).getTime() : 0;
    return {
      id: c.id,
      leadId: c.leadId,
      sede: c.sede,
      botPaused: c.botPaused,
      botResumeAt: c.botResumeAt ? c.botResumeAt.toISOString() : null,
      lastInboundAt: c.lastInboundAt ? c.lastInboundAt.toISOString() : null,
      lastOutboundAt: c.lastOutboundAt ? c.lastOutboundAt.toISOString() : null,
      leadName: [c.lead.firstName, c.lead.lastName].filter(Boolean).join(" ") || "Sin nombre",
      leadPhone: c.lead.phone,
      stage: c.lead.stage,
      ownerUserId: c.lead.ownerUserId,
      ownerName: c.lead.owner?.fullName ?? null,
      lastMessageBody: last?.body ?? null,
      lastMessageDirection: last?.direction ?? null,
      lastMessageFailed: last?.sendStatus === "FAILED",
      needsAttention: inboundMs > outboundMs,
      windowOpen: inboundMs > 0 && now - inboundMs < WINDOW_MS,
    };
  });
}

export type ThreadMessage = {
  id: string;
  direction: MessageDirection;
  body: string;
  createdAt: string;
  /** "customer" | "bot" | staff full name */
  senderLabel: string;
  isBot: boolean;
  isStaff: boolean;
  /**
   * "SENT" | "FAILED" | "DRAFT", or null for inbound and for legacy rows written
   * before the column existed. null means unknown — never render it as a failure.
   */
  sendStatus: string | null;
  /** Graph error summary, only set when sendStatus === "FAILED". */
  sendError: string | null;
  sendAttemptedAt: string | null;
  /** Inbound media the lead sent: "audio" | "image" | "video" | "document" | "sticker". */
  mediaKind: string | null;
  /** Streamed from /api/whatsapp/media/[mediaId]; null when the message has no file. */
  mediaUrl: string | null;
  mediaMimeType: string | null;
  /** true = recorded voice note (vs. an attached audio file). */
  mediaVoice: boolean;
};

export type ThreadData = {
  conversationId: string;
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  sede: Sede;
  stage: LeadStage;
  botPaused: boolean;
  botResumeAt: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  windowOpen: boolean;
  messages: ThreadMessage[];
};

/** Full message history for one conversation. */
export async function getConversationThread(conversationId: string): Promise<ThreadData> {
  await requireInboxAccess();

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      lead: { include: { owner: { select: { fullName: true } } } },
      messages: { orderBy: { createdAt: "asc" }, take: 100 },
    },
  });
  if (!conversation) throw new Error("Conversación no encontrada.");

  // Resolve staff names for manually-sent outbound messages.
  const staffIds = [
    ...new Set(conversation.messages.map((m) => m.sentByUserId).filter((v): v is string => !!v)),
  ];
  const staff = staffIds.length
    ? await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, fullName: true } })
    : [];
  const staffName = new Map(staff.map((s) => [s.id, s.fullName]));

  const inboundMs = conversation.lastInboundAt ? new Date(conversation.lastInboundAt).getTime() : 0;

  return {
    conversationId: conversation.id,
    leadId: conversation.leadId,
    leadName: [conversation.lead.firstName, conversation.lead.lastName].filter(Boolean).join(" ") || "Sin nombre",
    leadPhone: conversation.lead.phone,
    sede: conversation.sede,
    stage: conversation.lead.stage,
    botPaused: conversation.botPaused,
    botResumeAt: conversation.botResumeAt ? conversation.botResumeAt.toISOString() : null,
    ownerUserId: conversation.lead.ownerUserId,
    ownerName: conversation.lead.owner?.fullName ?? null,
    windowOpen: inboundMs > 0 && Date.now() - inboundMs < WINDOW_MS,
    messages: conversation.messages.map((m) => {
      const isBot = m.direction === "OUTBOUND" && m.llmGenerated;
      const isStaff = m.direction === "OUTBOUND" && !m.llmGenerated;
      const senderLabel =
        m.direction === "INBOUND"
          ? "Cliente"
          : isBot
            ? "Agente IA"
            : (m.sentByUserId ? staffName.get(m.sentByUserId) ?? "Staff" : "Staff");
      return {
        id: m.id,
        direction: m.direction,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        senderLabel,
        isBot,
        isStaff,
        sendStatus: m.sendStatus,
        sendError: m.sendError,
        sendAttemptedAt: m.sendAttemptedAt ? m.sendAttemptedAt.toISOString() : null,
        mediaKind: m.mediaKind,
        mediaUrl: m.mediaId ? `/api/whatsapp/media/${encodeURIComponent(m.mediaId)}` : null,
        mediaMimeType: m.mediaMimeType,
        mediaVoice: m.mediaVoice === true,
      };
    }),
  };
}

/** Staff who can own a conversation (for the assignee dropdown). */
export async function getAssignableStaff(): Promise<Array<{ id: string; name: string }>> {
  await requireInboxAccess();
  const users = await prisma.user.findMany({
    where: { active: true, role: { in: ["OWNER", "ACCOUNTING", "ADMIN"] } },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  return users.map((u) => ({ id: u.id, name: u.fullName }));
}

/** Assign the conversation's lead to a staff member (or the current user). */
export async function assignConversation(leadId: string, userId: string | null): Promise<void> {
  const user = await requireInboxAccess();
  await prisma.lead.update({
    where: { id: leadId },
    data: { ownerUserId: userId === "me" ? user.id : userId },
  });
  revalidatePath("/dashboard/comunicacion");
}

/** Pause the bot so a human owns the conversation. Clears any pending hand-back. */
export async function takeOverConversation(conversationId: string): Promise<void> {
  await requireInboxAccess();
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { botPaused: true, botResumeAt: null },
  });
  revalidatePath("/dashboard/comunicacion");
}

/** Hand the conversation back to the agent right now. */
export async function resumeBot(conversationId: string): Promise<void> {
  await requireInboxAccess();
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { botPaused: false, botResumeAt: null },
  });
  revalidatePath("/dashboard/comunicacion");
}

/**
 * Hand the conversation back to the agent at a chosen moment ("el lunes 8am").
 * It stays paused — and visibly so in the inbox — until then; the runner
 * releases it on the next inbound, and the cron sweeps it even if nobody writes.
 */
export async function scheduleBotResume(
  conversationId: string,
  preset: ResumePreset,
): Promise<{ resumeAt: string | null }> {
  await requireInboxAccess();
  const resumeAt = resolveResumeAt(preset);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: resumeAt ? { botPaused: true, botResumeAt: resumeAt } : { botPaused: false, botResumeAt: null },
  });
  revalidatePath("/dashboard/comunicacion");
  return { resumeAt: resumeAt ? resumeAt.toISOString() : null };
}

/**
 * End of shift: hand every conversation I am holding back to the bot, now or at
 * a chosen time. This is the Friday-evening button — one click instead of
 * remembering each thread you took over during the day.
 */
export async function endShiftReturnToBot(
  preset: ResumePreset,
  scope: "mine" | "all" = "mine",
): Promise<{ count: number; resumeAt: string | null }> {
  const user = await requireInboxAccess();
  const resumeAt = resolveResumeAt(preset);

  const { count } = await prisma.conversation.updateMany({
    where: {
      botPaused: true,
      // "Mías" = las que me asignaron O las que respondí yo. Lo segundo importa:
      // en la práctica el staff contesta conversaciones sin dueño asignado, así
      // que filtrar solo por ownerUserId dejaría el botón sin efecto.
      ...(scope === "mine"
        ? {
            OR: [
              { lead: { ownerUserId: user.id } },
              { messages: { some: { sentByUserId: user.id } } },
            ],
          }
        : {}),
    },
    data: resumeAt ? { botResumeAt: resumeAt } : { botPaused: false, botResumeAt: null },
  });

  revalidatePath("/dashboard/comunicacion");
  return { count, resumeAt: resumeAt ? resumeAt.toISOString() : null };
}

export type SendReplyResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Send a manual staff reply. Sending implies taking over (pauses the bot so it
 * doesn't also answer). Only allowed inside WhatsApp's 24h service window —
 * outside it, WhatsApp requires an approved template (Fase 2/3).
 */
export async function sendManualReply(conversationId: string, body: string): Promise<SendReplyResult> {
  const user = await requireInboxAccess();
  const text = body.trim();
  if (!text) return { ok: false, error: "El mensaje está vacío." };

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return { ok: false, error: "Conversación no encontrada." };

  const inboundMs = conversation.lastInboundAt ? new Date(conversation.lastInboundAt).getTime() : 0;
  const windowOpen = inboundMs > 0 && Date.now() - inboundMs < WINDOW_MS;
  if (!windowOpen) {
    return {
      ok: false,
      error: "Fuera de la ventana de 24h de WhatsApp. Para reabrir necesitas una plantilla aprobada (próximamente).",
    };
  }

  try {
    const sent = await sendText(conversation.externalId, text);
    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: "OUTBOUND",
          channel: "WHATSAPP",
          externalId: sent.messageId,
          body: text,
          sentByUserId: user.id,
          llmGenerated: false,
          // Only reached when sendText resolved, so this row is always SENT. A
          // failed manual send never creates a Message — the error is surfaced
          // to the sender synchronously below.
          sendStatus: "SENT",
          sendAttemptedAt: new Date(),
        },
      }),
      // Sending manually = taking over: pause the bot and stamp the outbound time.
      // botResumeAt se limpia a propósito: el bot pone una fecha de vuelta cuando
      // escala solo, y si no la borráramos aquí el bot se metería en medio de la
      // conversación que esta persona acaba de tomar.
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { botPaused: true, botResumeAt: null, lastOutboundAt: new Date() },
      }),
    ]);
    revalidatePath("/dashboard/comunicacion");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo enviar." };
  }
}
