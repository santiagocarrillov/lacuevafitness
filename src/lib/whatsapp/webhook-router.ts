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
import type { Sede } from "@/generated/prisma/client";
import { markAsRead } from "@/lib/whatsapp/client";

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

type WaMediaMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: "image" | "audio" | "video" | "document" | "sticker";
  // We don't fetch media in Sem 1 — just record that something arrived.
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

function extractBody(msg: WaMessage): { body: string; mediaUrl: string | null } {
  if (msg.type === "text") return { body: (msg as WaTextMessage).text.body, mediaUrl: null };
  if (msg.type === "interactive") {
    const inter = (msg as WaInteractiveReply).interactive;
    const reply = inter.button_reply ?? inter.list_reply;
    return { body: reply ? `[${reply.id}] ${reply.title}` : "[interactive]", mediaUrl: null };
  }
  // Media / unsupported — record type as placeholder. Sem 2+ may fetch media URLs.
  return { body: `[${msg.type}]`, mediaUrl: null };
}

// ── Main entry ─────────────────────────────────────────────────────────────

export type ProcessResult = {
  processed: number;
  skipped: number;
  statuses: number;
};

export async function processWebhookPayload(payload: unknown): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, skipped: 0, statuses: 0 };
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
          await ingestInbound(msg, contactName.get(msg.from));
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

  return result;
}

async function ingestInbound(msg: WaMessage, profileName: string | undefined): Promise<void> {
  const waUserId = msg.from;
  const { body, mediaUrl } = extractBody(msg);
  const occurredAt = new Date(Number(msg.timestamp) * 1000);

  // Idempotency short-circuit: if we've already stored this externalId, no-op.
  const existing = await prisma.message.findUnique({ where: { externalId: msg.id } });
  if (existing) return;

  // Find conversation by (channel, externalId). Create lead+conversation if first contact.
  let conversation = await prisma.conversation.findUnique({
    where: { channel_externalId: { channel: "WHATSAPP", externalId: waUserId } },
  });

  if (!conversation) {
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

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        channel: "WHATSAPP",
        externalId: msg.id,
        body,
        mediaUrl,
        createdAt: occurredAt,
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastInboundAt: occurredAt },
    }),
  ]);

  // Best-effort blue ticks. Non-critical.
  await markAsRead(msg.id);
}
