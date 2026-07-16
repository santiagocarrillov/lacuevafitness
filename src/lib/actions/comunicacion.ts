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
import type { LeadStage, MessageDirection, Sede } from "@/generated/prisma/client";

const WINDOW_MS = 24 * 60 * 60 * 1000;

async function requireInboxAccess() {
  const user = await requireAuth();
  if (!can.manageLeads(user)) {
    throw new Error("No tienes permiso para el centro de comunicación.");
  }
  return user;
}

export type InboxFilter = "all" | "unassigned" | "mine";

export type ConversationRow = {
  id: string;
  leadId: string;
  sede: Sede;
  botPaused: boolean;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  leadName: string;
  leadPhone: string | null;
  stage: LeadStage;
  ownerUserId: string | null;
  ownerName: string | null;
  lastMessageBody: string | null;
  lastMessageDirection: MessageDirection | null;
  /** Customer wrote last and nobody has replied → needs attention. */
  needsAttention: boolean;
  /** WhatsApp 24h service window still open (free-text replies allowed). */
  windowOpen: boolean;
};

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
    where: { lead: { is: leadWhere } },
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
      lastInboundAt: c.lastInboundAt ? c.lastInboundAt.toISOString() : null,
      lastOutboundAt: c.lastOutboundAt ? c.lastOutboundAt.toISOString() : null,
      leadName: [c.lead.firstName, c.lead.lastName].filter(Boolean).join(" ") || "Sin nombre",
      leadPhone: c.lead.phone,
      stage: c.lead.stage,
      ownerUserId: c.lead.ownerUserId,
      ownerName: c.lead.owner?.fullName ?? null,
      lastMessageBody: last?.body ?? null,
      lastMessageDirection: last?.direction ?? null,
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
};

export type ThreadData = {
  conversationId: string;
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  sede: Sede;
  stage: LeadStage;
  botPaused: boolean;
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

/** Pause the bot so a human owns the conversation. */
export async function takeOverConversation(conversationId: string): Promise<void> {
  await requireInboxAccess();
  await prisma.conversation.update({ where: { id: conversationId }, data: { botPaused: true } });
  revalidatePath("/dashboard/comunicacion");
}

/** Hand the conversation back to the agent. */
export async function resumeBot(conversationId: string): Promise<void> {
  await requireInboxAccess();
  await prisma.conversation.update({ where: { id: conversationId }, data: { botPaused: false } });
  revalidatePath("/dashboard/comunicacion");
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
        },
      }),
      // Sending manually = taking over: pause the bot and stamp the outbound time.
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { botPaused: true, lastOutboundAt: new Date() },
      }),
    ]);
    revalidatePath("/dashboard/comunicacion");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo enviar." };
  }
}
