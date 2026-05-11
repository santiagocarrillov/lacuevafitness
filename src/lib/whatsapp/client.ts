/**
 * WhatsApp Cloud API client (Graph API).
 *
 * Uses native fetch — no SDK. Reads credentials from env on each call so
 * test scripts and route handlers share the same module without bootstrap.
 */

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0";

function endpoint(): string {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!phoneId) throw new Error("WHATSAPP_PHONE_ID not set");
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
}

function authHeaders(): HeadersInit {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error("WHATSAPP_TOKEN not set");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export type SendResult = {
  messageId: string;
  raw: unknown;
};

async function postGraph(body: unknown): Promise<SendResult> {
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const detail = typeof json === "object" ? JSON.stringify(json) : String(json);
    throw new Error(`WhatsApp API ${res.status}: ${detail}`);
  }
  const messageId: string | undefined = json?.messages?.[0]?.id;
  if (!messageId) throw new Error(`WhatsApp API: no message id in response — ${JSON.stringify(json)}`);
  return { messageId, raw: json };
}

/**
 * Send a free-form text message. Only allowed inside the 24h customer-service window.
 * Outside the window → use sendTemplate.
 */
export async function sendText(to: string, body: string): Promise<SendResult> {
  return postGraph({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body },
  });
}

/**
 * Send an approved template message. Required for outbound outside the 24h window
 * (e.g. trial reminders, no-show recovery).
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  language: string,
  variables: string[] = [],
): Promise<SendResult> {
  const components = variables.length
    ? [{
        type: "body",
        parameters: variables.map((v) => ({ type: "text", text: v })),
      }]
    : undefined;
  return postGraph({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      ...(components ? { components } : {}),
    },
  });
}

/**
 * Send an interactive button message (max 3 buttons, ids ≤ 256 chars).
 * Used for ADMIN_ATTENDANCE_PING (Sí / No buttons).
 */
export async function sendInteractiveButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>,
): Promise<SendResult> {
  if (buttons.length === 0 || buttons.length > 3) {
    throw new Error("WhatsApp interactive: 1-3 buttons required");
  }
  return postGraph({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

/**
 * Mark an inbound message as read (blue ticks). Best-effort; failures are swallowed.
 */
export async function markAsRead(messageExternalId: string): Promise<void> {
  try {
    await fetch(endpoint(), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageExternalId,
      }),
    });
  } catch {
    // Non-critical
  }
}
