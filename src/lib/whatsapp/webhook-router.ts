/**
 * WhatsApp webhook router — Sem 1 scope.
 *
 * Parses Meta's webhook payload, finds-or-creates a Lead + Conversation,
 * persists each inbound Message idempotently, and updates conversation timestamps.
 *
 * Bot reply logic (intent classifier + LLM) is NOT wired here yet — that lands in Sem 2.
 * For now the router only ingests; outbound is driven manually via scripts or admin UI.
 */

import { prisma } from "@/lib/prisma";
import { phoneKey } from "./contact";
import type { Sede } from "@/generated/prisma/client";
import { markAsRead } from "@/lib/whatsapp/client";
import { parseReferral, leadAttributionUpdate } from "@/lib/whatsapp/referral";
import { mediaPlaceholder } from "@/lib/whatsapp/media";
import { reactionBody, type WaReaction } from "@/lib/whatsapp/reactions";

// ── Meta webhook payload types (subset we use) ─────────────────────────────

type WaContact = {
  wa_id: string;
  profile?: { name?: string };
};

type WaTextMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: "text";
  text: { body: string };
};

type WaInteractiveReply = {
  id: string;
  from: string;
  timestamp: string;
  type: "interactive";
  interactive: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
};

type WaMediaKind = "image" | "audio" | "video" | "document" | "sticker";

type WaMediaObject = {
  id?: string;
  mime_type?: string;
  /** Only on audio: true = recorded voice note, false/absent = attached audio file. */
  voice?: boolean;
  caption?: string;
  filename?: string;
};

type WaMediaMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: WaMediaKind;
  [k: string]: unknown;
};

type WaUnsupportedMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  [k: string]: unknown;
};

type WaMessage = WaTextMessage | WaInteractiveReply | WaMediaMessage | WaUnsupportedMessage;

type WaStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
};

type WaChangeValue = {
  messaging_product: "whatsapp";
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: WaContact[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
};

type WaWebhookPayload = {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: WaChangeValue;
    }>;
  }>;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultSede(): Sede {
  const v = process.env.WHATSAPP_DEFAULT_SEDE;
  return v === "XTREME" ? "XTREME" : "FITNESS_CENTER";
}

const MEDIA_KINDS: readonly string[] = ["image", "audio", "video", "document", "sticker"];

type ExtractedMessage = {
  body: string;
  mediaUrl: string | null;
  mediaId: string | null;
  mediaMimeType: string | null;
  mediaKind: string | null;
  mediaVoice: boolean | null;
};

const NO_MEDIA = { mediaUrl: null, mediaId: null, mediaMimeType: null, mediaKind: null, mediaVoice: null };

function extractBody(msg: WaMessage): ExtractedMessage {
  if (msg.type === "text") return { body: (msg as WaTextMessage).text.body, ...NO_MEDIA };
  if (msg.type === "interactive") {
    const inter = (msg as WaInteractiveReply).interactive;
    const reply = inter.button_reply ?? inter.list_reply;
    return { body: reply ? `[${reply.id}] ${reply.title}` : "[interactive]", ...NO_MEDIA };
  }

  // Media: keep the id so the inbox can stream the file and the agent can be told
  // what it is. Before this we stored only "[audio]" and dropped the id — which is
  // why voice notes were unplayable in the app and invisible to the bot.
  if (MEDIA_KINDS.includes(msg.type)) {
    const kind = msg.type as WaMediaKind;
    const media = (msg as Record<string, unknown>)[kind] as WaMediaObject | undefined;
    const caption = typeof media?.caption === "string" ? media.caption.trim() : "";
    const voice = media?.voice === true;
    return {
      // A caption is real text from the lead — keep it as the body so search and the
      // conversation list read naturally; the media badge carries the rest.
      body: caption || mediaPlaceholder(kind, voice),
      mediaUrl: null,
      mediaId: typeof media?.id === "string" ? media.id : null,
      mediaMimeType: typeof media?.mime_type === "string" ? media.mime_type : null,
      mediaKind: kind,
      mediaVoice: kind === "audio" ? voice : null,
    };
  }

  // Unsupported (reactions, orders, system events…) — record that something arrived.
  return { body: `[${msg.type}]`, ...NO_MEDIA };
}

// ── Main entry ─────────────────────────────────────────────────────────────

export type ProcessResult = {
  processed: number;
  skipped: number;
  statuses: number;
  /** Conversation ids that received a NEW inbound message (for the agent to answer). */
  conversationIds: string[];
  /**
   * Per conversation, the id of the LAST inbound message this delivery stored.
   * The agent uses it to tell "I am the newest trigger" from "a later message
   * already arrived", which is how a burst of messages collapses into one reply.
   */
  inbound: Array<{ conversationId: string; messageId: string }>;
};

export async function processWebhookPayload(payload: unknown): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, skipped: 0, statuses: 0, conversationIds: [], inbound: [] };
  // Last stored message id per conversation — later entries overwrite earlier ones.
  const lastInboundByConversation = new Map<string, string>();
  const wp = payload as WaWebhookPayload;
  if (!wp?.entry?.length) return result;

  for (const entry of wp.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;

      // Build a quick lookup: wa_id → contact name
      const contactName = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.profile?.name) contactName.set(c.wa_id, c.profile.name);
      }

      for (const msg of value.messages ?? []) {
        try {
          const stored = await ingestInbound(msg, contactName.get(msg.from));
          // Una reacción queda en el hilo pero no despierta al bot.
          if (stored && !stored.isReaction) {
            lastInboundByConversation.set(stored.conversationId, stored.messageId);
          }
          result.processed += 1;
        } catch (err) {
          // Idempotency collision (duplicate externalId) is the most common case.
          if (err instanceof Error && err.message.includes("Unique constraint")) {
            result.skipped += 1;
          } else {
            console.error("[whatsapp] ingest failed", err);
            result.skipped += 1;
          }
        }
      }

      for (const _status of value.statuses ?? []) {
        // Sem 1: counted but not persisted. Sem 4 may surface delivery state in inbox UI.
        result.statuses += 1;
      }
    }
  }

  result.conversationIds = [...lastInboundByConversation.keys()];
  result.inbound = [...lastInboundByConversation].map(([conversationId, messageId]) => ({
    conversationId,
    messageId,
  }));
  return result;
}

/** Returns the conversation + stored message id for a NEW inbound, else null (duplicate). */
async function ingestInbound(
  msg: WaMessage,
  profileName: string | undefined,
): Promise<{ conversationId: string; messageId: string; isReaction: boolean } | null> {
  const waUserId = msg.from;
  const extracted = extractBody(msg);
  const { mediaUrl, mediaId, mediaMimeType, mediaKind, mediaVoice } = extracted;
  let body = extracted.body;
  const isReaction = msg.type === "reaction";
  if (isReaction) {
    const reaction = (msg as Record<string, unknown>).reaction as WaReaction | undefined;
    const target = reaction?.message_id
      ? await prisma.message.findUnique({ where: { externalId: reaction.message_id }, select: { body: true } })
      : null;
    body = reactionBody(reaction?.emoji, target?.body ?? null);
  }
  const occurredAt = new Date(Number(msg.timestamp) * 1000);
  // Click-to-WhatsApp ad/post referral (only present on the first message from an ad tap).
  const referral = parseReferral(msg);

  // Idempotency short-circuit: if we've already stored this externalId, no-op.
  const existing = await prisma.message.findUnique({ where: { externalId: msg.id } });
  if (existing) return null;

  // Find conversation by (channel, externalId). Create lead+conversation if first contact.
  let conversation = await prisma.conversation.findUnique({
    where: { channel_externalId: { channel: "WHATSAPP", externalId: waUserId } },
  });

  if (!conversation) {
    // ¿Es un socio que ya conocemos? Antes de inventarle ficha de lead a alguien
    // que lleva meses entrenando aquí, se busca por los últimos 9 dígitos: el
    // mismo celular vive como "0986615931" en la ficha del socio y como
    // "593986615931" en el wa_id. Solo aplica a números con los que NUNCA
    // habíamos hablado; un lead que se hizo socio conserva su conversación.
    const member = await findMemberWithoutConversation(waUserId);
    if (member) {
      conversation = await prisma.conversation.create({
        data: {
          memberId: member.id,
          sede: member.sede,
          channel: "WHATSAPP",
          externalId: waUserId,
          lastInboundAt: occurredAt,
          // El agente vende. A un socio que escribe lo atiende una persona.
          botPaused: true,
        },
      });
    } else {
    const sede = defaultSede();
    const firstName = profileName?.split(/\s+/)[0] ?? "Sin nombre";
    const lastName = profileName?.split(/\s+/).slice(1).join(" ") || null;

    const lead = await prisma.lead.create({
      data: {
        sede,
        firstName,
        lastName,
        phone: waUserId,
        source: "WHATSAPP",
        stage: "NEW",
        ...(referral
          ? leadAttributionUpdate({ source: "WHATSAPP", adSourceId: null, ctwaClid: null, adSourceUrl: null }, referral, occurredAt)
          : {}),
      },
    });

      conversation = await prisma.conversation.create({
        data: {
          leadId: lead.id,
          sede,
          channel: "WHATSAPP",
          externalId: waUserId,
          lastInboundAt: occurredAt,
        },
      });
    }
  } else if (referral && conversation.leadId) {
    // Existing lead tapped an ad: first touch wins (helper returns {} if already attributed).
    const lead = await prisma.lead.findUnique({
      where: { id: conversation.leadId },
      select: { source: true, adSourceId: true, ctwaClid: true, adSourceUrl: true },
    });
    const data = lead ? leadAttributionUpdate(lead, referral, occurredAt) : {};
    if (Object.keys(data).length > 0) {
      await prisma.lead.update({ where: { id: conversation.leadId }, data });
    }
  }

  const [stored] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        channel: "WHATSAPP",
        externalId: msg.id,
        body,
        mediaUrl,
        mediaId,
        mediaMimeType,
        mediaKind,
        mediaVoice,
        ...(referral ? { referral } : {}),
        createdAt: occurredAt,
      },
    }),
    // Una reacción no mueve lastInboundAt: answerUnansweredInbounds lo leería como
    // "el cliente escribió y nadie contestó" y el bot le respondería a un 👍.
    ...(isReaction
      ? []
      : [
          prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastInboundAt: occurredAt },
          }),
        ]),
  ]);

  // Best-effort blue ticks. Non-critical.
  await markAsRead(msg.id);

  return { conversationId: conversation.id, messageId: stored.id, isReaction };
}


/**
 * Socio cuyo teléfono coincide con este wa_id y que todavía no tiene
 * conversación. El match es por los últimos 9 dígitos porque los formatos
 * guardados son un zoo ("0986615931", "+593986615931", "+5930999033400").
 */
async function findMemberWithoutConversation(
  waUserId: string,
): Promise<{ id: string; sede: Sede } | null> {
  const key = phoneKey(waUserId);
  if (!key) return null;
  const rows = await prisma.$queryRaw<Array<{ id: string; sede: Sede }>>`
    SELECT m.id, m.sede
    FROM "Member" m
    LEFT JOIN "Conversation" c ON c."memberId" = m.id
    WHERE c.id IS NULL
      AND length(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')) >= 9
      AND right(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g'), 9) = ${key}
    ORDER BY m."updatedAt" DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}
