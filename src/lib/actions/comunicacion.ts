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
import { MEMBER_OWNED_STAGES, STAGE_LABEL } from "@/lib/leads/stages";
import { contactOf, phoneKey } from "@/lib/whatsapp/contact";
import {
  MIN_QUERY_LENGTH,
  SQL_ACCENTS_FROM,
  SQL_ACCENTS_TO,
  likePattern,
  normalizeQuery,
} from "@/lib/whatsapp/search";
import { Prisma } from "@/generated/prisma/client";
import type { LeadStage, MemberStatus, MessageDirection, Sede } from "@/generated/prisma/client";

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
  /** Uno de los dos está seteado: la conversación es de un lead O de un socio. */
  leadId: string | null;
  memberId: string | null;
  contactKind: "lead" | "member";
  sede: Sede;
  botPaused: boolean;
  /** ISO time when the bot takes this conversation back on its own, or null. */
  botResumeAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  contactName: string;
  contactPhone: string | null;
  /** Etapa del embudo, o null si ya es socio (entonces manda memberStatus). */
  stage: LeadStage | null;
  memberStatus: MemberStatus | null;
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

/** Lo que necesita una fila del inbox. Compartido entre el listado y la búsqueda. */
const CONVERSATION_ROW_INCLUDE = {
  lead: { include: { owner: { select: { fullName: true } } } },
  member: { select: { id: true, firstName: true, lastName: true, phone: true, status: true, sede: true } },
  messages: { orderBy: { createdAt: "desc" as const }, take: 1 },
};

type ConversationWithRow = Prisma.ConversationGetPayload<{
  include: typeof CONVERSATION_ROW_INCLUDE;
}>;

function toConversationRow(c: ConversationWithRow, now: number): ConversationRow {
  const contact = contactOf(c);
  const last = c.messages[0] ?? null;
  const inboundMs = c.lastInboundAt ? new Date(c.lastInboundAt).getTime() : 0;
  const outboundMs = c.lastOutboundAt ? new Date(c.lastOutboundAt).getTime() : 0;
  return {
    id: c.id,
    leadId: contact.leadId,
    memberId: contact.memberId,
    contactKind: contact.kind,
    sede: c.sede,
    botPaused: c.botPaused,
    botResumeAt: c.botResumeAt ? c.botResumeAt.toISOString() : null,
    lastInboundAt: c.lastInboundAt ? c.lastInboundAt.toISOString() : null,
    lastOutboundAt: c.lastOutboundAt ? c.lastOutboundAt.toISOString() : null,
    contactName: contact.name,
    contactPhone: contact.phone,
    stage: contact.stage,
    memberStatus: contact.memberStatus,
    ownerUserId: c.lead?.ownerUserId ?? null,
    ownerName: c.lead?.owner?.fullName ?? null,
    lastMessageBody: last?.body ?? null,
    lastMessageDirection: last?.direction ?? null,
    lastMessageFailed: last?.sendStatus === "FAILED",
    needsAttention: inboundMs > outboundMs,
    windowOpen: inboundMs > 0 && now - inboundMs < WINDOW_MS,
  };
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
    // "Sin asignar" y "Mías" hablan del dueño del LEAD, así que solo miran
    // conversaciones de lead. Las de socios aparecen en "Todas" y "Esperando".
    where: {
      ...(filter === "unassigned" || filter === "mine" ? { lead: { is: leadWhere } } : {}),
      ...(filter === "waiting" ? waitingForHuman() : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: CONVERSATION_ROW_INCLUDE,
  });

  const now = Date.now();
  return conversations.map((c) => toConversationRow(c, now));
}

// ── Búsqueda ────────────────────────────────────────────────────────────────
//
// Dos búsquedas, como WhatsApp: una global sobre todo el inbox (pestaña de la
// izquierda) y otra dentro de la conversación abierta. Las dos comparten el
// mismo plegado de acentos de `@/lib/whatsapp/search`, en SQL vía `translate()`
// para no depender de la extensión `unaccent` — cero migraciones.

const CHAT_HITS_LIMIT = 30;
const MESSAGE_HITS_LIMIT = 60;
const MEMBER_HITS_LIMIT = 15;
/** Tope de coincidencias dentro de un chat. Más que esto ya no se navega a mano. */
const THREAD_HITS_LIMIT = 300;

/** `translate(lower(<col>), …)` — el plegado de acentos del lado de Postgres. */
function foldedSql(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`translate(lower(${column}), ${SQL_ACCENTS_FROM}, ${SQL_ACCENTS_TO})`;
}

/**
 * Variantes del número a buscar. En Ecuador el mismo celular se escribe
 * `0996615383` (local) y se guarda `+593996615383` (internacional): buscar el
 * local no puede fallar solo por el 0 de más.
 */
function phonePatterns(query: string): [string | null, string | null] {
  const digits = query.replace(/\D/g, "");
  if (digits.length < 6) return [null, null];
  const primary = `%${digits}%`;
  const alt = digits.startsWith("0") ? `%${digits.slice(1)}%` : primary;
  return [primary, alt];
}

export type MessageHit = {
  messageId: string;
  conversationId: string;
  leadId: string | null;
  contactName: string;
  sede: Sede;
  direction: MessageDirection;
  /** Cuerpo completo: el recorte y el resaltado se hacen en el cliente. */
  body: string;
  createdAt: string;
  senderLabel: string;
};

export type MemberHit = {
  memberId: string;
  name: string;
  phone: string | null;
  sede: Sede;
  status: MemberStatus;
  /** Conversación existente, si ya le hemos escrito. */
  conversationId: string | null;
};

export type InboxSearchResult = {
  /** Conversaciones cuyo contacto (nombre o teléfono) coincide. */
  chats: ConversationRow[];
  /** Mensajes cuyo texto coincide, del más reciente al más viejo. */
  messages: MessageHit[];
  /** Socios con teléfono que todavía no tienen conversación abierta. */
  members: MemberHit[];
  chatsTruncated: boolean;
  messagesTruncated: boolean;
};

const EMPTY_SEARCH: InboxSearchResult = {
  chats: [],
  messages: [],
  members: [],
  chatsTruncated: false,
  messagesTruncated: false,
};

/**
 * Búsqueda global del inbox: contactos por nombre/teléfono y mensajes por texto.
 *
 * Devuelve las dos listas por separado a propósito — "Andrea" como contacto y
 * "Andrea" dicho dentro de un chat son dos resultados distintos y mezclarlos
 * esconde el que la persona estaba buscando.
 */
export async function searchInbox(query: string): Promise<InboxSearchResult> {
  await requireInboxAccess();

  const folded = normalizeQuery(query);
  if (folded.length < MIN_QUERY_LENGTH) return EMPTY_SEARCH;
  const like = likePattern(folded);
  const [phoneLike, phoneLikeAlt] = phonePatterns(query);

  const [chatIdRows, messageIdRows, memberRows] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT c.id
      FROM "Conversation" c
      JOIN "Lead" l ON l.id = c."leadId"
      WHERE ${foldedSql(Prisma.sql`coalesce(l."firstName", '') || ' ' || coalesce(l."lastName", '')`)} LIKE ${like}
         OR (
              ${phoneLike}::text IS NOT NULL
              AND (
                   regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') LIKE ${phoneLike}::text
                OR regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') LIKE ${phoneLikeAlt}::text
              )
            )
      ORDER BY c."updatedAt" DESC
      LIMIT ${CHAT_HITS_LIMIT + 1}
    `,
    prisma.$queryRaw<{ id: string }[]>`
      SELECT m.id
      FROM "Message" m
      WHERE ${foldedSql(Prisma.sql`m.body`)} LIKE ${like}
      ORDER BY m."createdAt" DESC
      LIMIT ${MESSAGE_HITS_LIMIT + 1}
    `,
    // Socios por nombre o teléfono. Es lo que permite escribirle a quien ya
    // entrena con nosotros ("¿por qué no has venido?") sin inventarle un lead.
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT m.id
      FROM "Member" m
      WHERE m.phone IS NOT NULL AND m.phone <> ''
        AND m.status <> 'CHURNED'
        AND (
          ${foldedSql(Prisma.sql`coalesce(m."firstName", '') || ' ' || coalesce(m."lastName", '')`)} LIKE ${like}
          OR (
               ${phoneLike}::text IS NOT NULL
               AND regexp_replace(m.phone, '[^0-9]', '', 'g') LIKE ${phoneLike}::text
             )
        )
      ORDER BY m."updatedAt" DESC
      LIMIT ${MEMBER_HITS_LIMIT}
    `,
  ]);

  const chatsTruncated = chatIdRows.length > CHAT_HITS_LIMIT;
  const messagesTruncated = messageIdRows.length > MESSAGE_HITS_LIMIT;
  const chatIds = chatIdRows.slice(0, CHAT_HITS_LIMIT).map((r) => r.id);
  const messageIds = messageIdRows.slice(0, MESSAGE_HITS_LIMIT).map((r) => r.id);

  const [chatRows, messageRows] = await Promise.all([
    chatIds.length
      ? prisma.conversation.findMany({
          where: { id: { in: chatIds } },
          orderBy: { updatedAt: "desc" },
          include: CONVERSATION_ROW_INCLUDE,
        })
      : Promise.resolve([]),
    messageIds.length
      ? prisma.message.findMany({
          where: { id: { in: messageIds } },
          orderBy: { createdAt: "desc" },
          include: {
            conversation: {
              select: {
                id: true,
                sede: true,
                leadId: true,
                memberId: true,
                lead: { select: { id: true, firstName: true, lastName: true, phone: true, stage: true, sede: true } },
                member: { select: { id: true, firstName: true, lastName: true, phone: true, status: true, sede: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const members = memberRows.length
    ? await prisma.member.findMany({
        where: { id: { in: memberRows.map((r) => r.id) } },
        select: {
          id: true, firstName: true, lastName: true, phone: true, sede: true, status: true,
          conversation: { select: { id: true } },
        },
      })
    : [];

  const staffName = await resolveStaffNames(messageRows.map((m) => m.sentByUserId));
  const now = Date.now();

  return {
    chats: chatRows.map((c) => toConversationRow(c, now)),
    messages: messageRows.map((m) => ({
      messageId: m.id,
      conversationId: m.conversation.id,
      leadId: m.conversation.leadId,
      contactName: contactOf(m.conversation).name,
      sede: m.conversation.sede,
      direction: m.direction,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      senderLabel: senderLabelFor(m, staffName),
    })),
    members: members.map((m) => ({
      memberId: m.id,
      name: [m.firstName, m.lastName].filter(Boolean).join(" ") || "Sin nombre",
      phone: m.phone,
      sede: m.sede,
      status: m.status,
      conversationId: m.conversation?.id ?? null,
    })),
    chatsTruncated,
    messagesTruncated,
  };
}

/**
 * Abrir (o reabrir) la conversación con un socio.
 *
 * No manda nada: deja el hilo creado para que la persona escriba desde el inbox
 * de siempre. El bot queda en pausa a propósito — el agente vende, y a un socio
 * que ya entrena con nosotros lo atiende alguien del equipo.
 */
export async function openMemberConversation(
  memberId: string,
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  await requireInboxAccess();

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, phone: true, sede: true, conversation: { select: { id: true } } },
  });
  if (!member) return { ok: false, error: "Socio no encontrado." };
  if (member.conversation) return { ok: true, conversationId: member.conversation.id };

  const key = phoneKey(member.phone);
  if (!key) {
    return { ok: false, error: "Este socio no tiene un teléfono válido en su ficha." };
  }

  // El wa_id es el número en formato internacional sin signos. Los celulares
  // ecuatorianos guardados como "09XXXXXXXX" son 593 + los 9 dígitos finales.
  const digits = member.phone!.replace(/\D/g, "");
  const externalId = digits.startsWith("593") ? digits : `593${key}`;

  // Puede existir ya una conversación con ese número atada a un LEAD (la persona
  // escribió antes de ser socia). En ese caso se usa esa, no se crea otra.
  const existing = await prisma.conversation.findUnique({
    where: { channel_externalId: { channel: "WHATSAPP", externalId } },
    select: { id: true },
  });
  if (existing) return { ok: true, conversationId: existing.id };

  const created = await prisma.conversation.create({
    data: {
      memberId: member.id,
      sede: member.sede,
      channel: "WHATSAPP",
      externalId,
      botPaused: true,
    },
    select: { id: true },
  });
  revalidatePath("/dashboard/comunicacion");
  return { ok: true, conversationId: created.id };
}

export type ConversationSearchResult = {
  /** Ids de los mensajes que coinciden, del más reciente al más viejo. */
  messageIds: string[];
  truncated: boolean;
};

/**
 * Búsqueda dentro de una conversación. Devuelve solo ids: el hilo abierto ya
 * tiene el texto, y los que no estén cargados se traen anclando el hilo en ese
 * mensaje (`getConversationThread(id, { aroundMessageId })`).
 */
export async function searchConversation(
  conversationId: string,
  query: string,
): Promise<ConversationSearchResult> {
  await requireInboxAccess();

  const folded = normalizeQuery(query);
  if (folded.length < MIN_QUERY_LENGTH) return { messageIds: [], truncated: false };

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT m.id
    FROM "Message" m
    WHERE m."conversationId" = ${conversationId}
      AND ${foldedSql(Prisma.sql`m.body`)} LIKE ${likePattern(folded)}
    ORDER BY m."createdAt" DESC
    LIMIT ${THREAD_HITS_LIMIT + 1}
  `;

  return {
    messageIds: rows.slice(0, THREAD_HITS_LIMIT).map((r) => r.id),
    truncated: rows.length > THREAD_HITS_LIMIT,
  };
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
  leadId: string | null;
  memberId: string | null;
  contactKind: "lead" | "member";
  contactName: string;
  contactPhone: string | null;
  sede: Sede;
  /** null cuando el contacto ya es socio: ahí manda memberStatus. */
  stage: LeadStage | null;
  botPaused: boolean;
  botResumeAt: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  windowOpen: boolean;
  /**
   * Estado del socio si esta persona ya lo es. Cuando existe, ES la verdad del
   * ciclo de vida y la etapa del lead deja de editarse — no repetimos el error
   * de tener el mismo hecho escrito en dos tablas.
   */
  memberStatus: MemberStatus | null;
  /** Mensaje en el que se ancló la carga (resultado de búsqueda), o null. */
  anchorMessageId: string | null;
  /** Hay mensajes anteriores al primero cargado. */
  hasOlder: boolean;
  messages: ThreadMessage[];
};

/** Nombres del staff para los mensajes enviados a mano (el resto no los necesita). */
async function resolveStaffNames(ids: Array<string | null>): Promise<Map<string, string>> {
  const staffIds = [...new Set(ids.filter((v): v is string => !!v))];
  if (staffIds.length === 0) return new Map();
  const staff = await prisma.user.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, fullName: true },
  });
  return new Map(staff.map((s) => [s.id, s.fullName]));
}

/** "Cliente" | "Agente IA" | "Automático" | nombre de quien lo escribió. */
function senderLabelFor(
  m: { direction: MessageDirection; llmGenerated: boolean; sentByUserId: string | null },
  staffName: Map<string, string>,
): string {
  if (m.direction === "INBOUND") return "Cliente";
  if (m.llmGenerated) return "Agente IA";
  // Saliente sin autor y sin modelo = lo mandó el sistema (recordatorio,
  // reenganche, rescate de no-show). Antes estos ni siquiera llegaban al hilo.
  if (!m.sentByUserId) return "Automático";
  return staffName.get(m.sentByUserId) ?? "Staff";
}

/** Cuántos mensajes se cargan de una: la cola del hilo, o la ventana alrededor del ancla. */
const THREAD_TAIL = 100;
const THREAD_WINDOW = 60;

/**
 * Full message history for one conversation.
 *
 * Por defecto trae la cola (los últimos {@link THREAD_TAIL}). Con
 * `aroundMessageId` trae una ventana alrededor de ese mensaje: es lo que hace
 * falta para saltar a un resultado de búsqueda de hace tres meses, que por
 * definición no está en la cola.
 */
export async function getConversationThread(
  conversationId: string,
  options?: { aroundMessageId?: string | null },
): Promise<ThreadData> {
  await requireInboxAccess();

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      lead: { include: { owner: { select: { fullName: true } } } },
      member: { select: { id: true, firstName: true, lastName: true, phone: true, status: true, sede: true } },
    },
  });
  if (!conversation) throw new Error("Conversación no encontrada.");

  const anchor = options?.aroundMessageId
    ? await prisma.message.findFirst({
        where: { id: options.aroundMessageId, conversationId },
        select: { id: true, createdAt: true },
      })
    : null;

  // Sin ancla (o con un ancla que ya no existe) se cae a la cola de siempre.
  const messages = anchor
    ? [
        ...(
          await prisma.message.findMany({
            where: { conversationId, createdAt: { lt: anchor.createdAt } },
            orderBy: { createdAt: "desc" },
            take: THREAD_WINDOW,
          })
        ).reverse(),
        ...(await prisma.message.findMany({
          where: { conversationId, createdAt: { gte: anchor.createdAt } },
          orderBy: { createdAt: "asc" },
          take: THREAD_WINDOW,
        })),
      ]
    : (
        await prisma.message.findMany({
          where: { conversationId },
          orderBy: { createdAt: "desc" },
          take: THREAD_TAIL,
        })
      ).reverse();

  // ¿Quedó historia por encima de lo cargado? Se avisa en el hilo para que nadie
  // crea que la conversación empieza ahí.
  const oldest = messages[0] ?? null;
  const hasOlder = oldest
    ? (await prisma.message.count({
        where: { conversationId, createdAt: { lt: oldest.createdAt } },
        take: 1,
      })) > 0
    : false;

  const staffName = await resolveStaffNames(messages.map((m) => m.sentByUserId));

  const contact = contactOf(conversation);
  // Un lead que YA es socio: su estado manda sobre la etapa del embudo.
  const memberOfLead = conversation.lead
    ? await prisma.member.findUnique({
        where: { leadId: conversation.lead.id },
        select: { id: true, status: true },
      })
    : null;
  const inboundMs = conversation.lastInboundAt ? new Date(conversation.lastInboundAt).getTime() : 0;

  return {
    conversationId: conversation.id,
    leadId: contact.leadId,
    contactName: contact.name,
    contactPhone: contact.phone,
    contactKind: contact.kind,
    memberId: contact.memberId,
    sede: conversation.sede,
    stage: contact.stage,
    botPaused: conversation.botPaused,
    botResumeAt: conversation.botResumeAt ? conversation.botResumeAt.toISOString() : null,
    ownerUserId: conversation.lead?.ownerUserId ?? null,
    ownerName: conversation.lead?.owner?.fullName ?? null,
    windowOpen: inboundMs > 0 && Date.now() - inboundMs < WINDOW_MS,
    memberStatus: contact.memberStatus ?? memberOfLead?.status ?? null,
    anchorMessageId: anchor?.id ?? null,
    hasOlder,
    messages: messages.map((m) => {
      const isBot = m.direction === "OUTBOUND" && m.llmGenerated;
      const isStaff = m.direction === "OUTBOUND" && !m.llmGenerated;
      const senderLabel = senderLabelFor(m, staffName);
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

/**
 * Cambiar la etapa del lead sin salir de la conversación.
 *
 * El momento en que sabes la etapa es justo cuando estás hablando con la
 * persona; obligar a ir a otra pantalla es como se pierden los datos. Queda
 * anotado en el historial del lead, para que dentro de un mes se sepa quién lo
 * movió y desde dónde.
 *
 * Se niega a tocar las etapas que manda el socio: marcar "Socio activo" no es
 * poner una etiqueta, es registrar una mensualidad en la ficha del socio.
 */
export async function setLeadStage(
  leadId: string,
  stage: LeadStage,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireInboxAccess();

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { stage: true, member: { select: { status: true } } },
  });
  if (!lead) return { ok: false, error: "Lead no encontrado." };
  if (lead.stage === stage) return { ok: true };

  if (lead.member) {
    return {
      ok: false,
      error: "Esta persona ya es socia: su estado se cambia desde su ficha, no aquí.",
    };
  }
  if (MEMBER_OWNED_STAGES.includes(stage)) {
    return {
      ok: false,
      error:
        stage === "CONVERTED"
          ? "Para marcarla como socia activa hay que registrarle la mensualidad en Socios."
          : "La evaluación arranca al registrar su asistencia, no cambiando la etapa.",
    };
  }

  await prisma.$transaction([
    prisma.lead.update({ where: { id: leadId }, data: { stage } }),
    prisma.leadInteraction.create({
      data: {
        leadId,
        userId: user.id,
        channel: "WHATSAPP",
        summary: `Etapa: ${STAGE_LABEL[lead.stage]} → ${STAGE_LABEL[stage]} (desde la conversación).`,
      },
    }),
  ]);

  revalidatePath("/dashboard/comunicacion");
  revalidatePath("/dashboard/leads");
  return { ok: true };
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
