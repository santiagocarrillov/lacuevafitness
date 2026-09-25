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

/** The bits of a Graph error worth storing on the Message row. */
export type GraphErrorSummary = {
  httpStatus: number | null;
  message: string | null;
  code: number | null;
  errorSubcode: number | null;
  fbtraceId: string | null;
};

/**
 * Thrown when the Cloud API rejects a send. Subclasses Error (so every existing
 * `err instanceof Error` / `err.message` path keeps working unchanged) and adds
 * the parsed Graph fields, which is what we persist on Message.sendError.
 */
export class WhatsAppSendError extends Error {
  readonly graph: GraphErrorSummary;
  constructor(message: string, graph: GraphErrorSummary) {
    super(message);
    this.name = "WhatsAppSendError";
    this.graph = graph;
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function summarizeGraph(httpStatus: number | null, json: unknown): GraphErrorSummary {
  const err =
    json && typeof json === "object" && "error" in json
      ? ((json as { error: unknown }).error as Record<string, unknown> | null)
      : null;
  if (!err || typeof err !== "object") {
    return { httpStatus, message: null, code: null, errorSubcode: null, fbtraceId: null };
  }
  return {
    httpStatus,
    message: str(err.message) ?? str(err.error_user_msg),
    code: num(err.code),
    errorSubcode: num(err.error_subcode),
    fbtraceId: str(err.fbtrace_id),
  };
}

/** Max length we store in Message.sendError — keeps the column bounded. */
export const SEND_ERROR_MAX = 1000;

/**
 * One-line, storable summary of a failed send. Accepts anything thrown by
 * sendText/sendTemplate/... including plain Errors (missing env vars, network).
 */
export function describeSendError(err: unknown): string {
  const parts: string[] = [];
  if (err instanceof WhatsAppSendError) {
    const g = err.graph;
    if (g.message) parts.push(`message=${g.message}`);
    if (g.code !== null) parts.push(`code=${g.code}`);
    if (g.errorSubcode !== null) parts.push(`error_subcode=${g.errorSubcode}`);
    if (g.fbtraceId) parts.push(`fbtrace_id=${g.fbtraceId}`);
    if (g.httpStatus !== null) parts.push(`http=${g.httpStatus}`);
  }
  if (parts.length === 0) {
    parts.push(err instanceof Error ? err.message : String(err));
  }
  return parts.join(" | ").slice(0, SEND_ERROR_MAX);
}

async function postGraph(body: unknown): Promise<SendResult> {
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const detail = typeof json === "object" ? JSON.stringify(json) : String(json);
    throw new WhatsAppSendError(
      `WhatsApp API ${res.status}: ${detail}`,
      summarizeGraph(res.status, json),
    );
  }
  const messageId: string | undefined = json?.messages?.[0]?.id;
  if (!messageId) {
    throw new WhatsAppSendError(
      `WhatsApp API: no message id in response — ${JSON.stringify(json)}`,
      summarizeGraph(res.status, json),
    );
  }
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
  /** Payloads for the template's quick-reply buttons, in button order. */
  quickReplies: string[] = [],
): Promise<SendResult> {
  const components: unknown[] = [];
  if (variables.length) {
    components.push({
      type: "body",
      parameters: variables.map((v) => ({ type: "text", text: v })),
    });
  }
  quickReplies.forEach((payload, index) => {
    components.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(index),
      parameters: [{ type: "payload", payload }],
    });
  });
  return postGraph({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      ...(components.length ? { components } : {}),
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
