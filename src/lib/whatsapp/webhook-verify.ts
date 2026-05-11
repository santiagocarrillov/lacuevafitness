/**
 * WhatsApp webhook helpers.
 *
 * - verifyChallenge: handles Meta's GET handshake during webhook setup.
 * - verifySignature: validates X-Hub-Signature-256 on inbound POSTs.
 *   Meta signs the raw request body with the App Secret (HMAC-SHA256).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type ChallengeResult =
  | { ok: true; challenge: string }
  | { ok: false; reason: string };

export function verifyChallenge(searchParams: URLSearchParams): ChallengeResult {
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!expected) return { ok: false, reason: "WHATSAPP_VERIFY_TOKEN not set" };
  if (mode !== "subscribe") return { ok: false, reason: "mode != subscribe" };
  if (token !== expected) return { ok: false, reason: "verify_token mismatch" };
  if (!challenge) return { ok: false, reason: "missing challenge" };

  return { ok: true, challenge };
}

export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    // Fail closed in production; in dev allow but warn.
    if (process.env.NODE_ENV === "production") return false;
    console.warn("[whatsapp] WHATSAPP_APP_SECRET not set — skipping signature check (dev only)");
    return true;
  }
  if (!signatureHeader) return false;

  // Header format: "sha256=<hex>"
  const [scheme, providedHex] = signatureHeader.split("=", 2);
  if (scheme !== "sha256" || !providedHex) return false;

  const expectedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  // Lengths must match before timingSafeEqual
  if (providedHex.length !== expectedHex.length) return false;

  try {
    return timingSafeEqual(Buffer.from(providedHex, "hex"), Buffer.from(expectedHex, "hex"));
  } catch {
    return false;
  }
}
