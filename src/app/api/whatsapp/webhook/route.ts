import { verifyChallenge, verifySignature } from "@/lib/whatsapp/webhook-verify";
import { processWebhookPayload } from "@/lib/whatsapp/webhook-router";

// Webhook must run on Node (crypto + Prisma) and never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/webhook — Meta verification handshake.
 * Called once when the webhook URL is registered in the Meta dashboard.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = verifyChallenge(url.searchParams);
  if (!result.ok) {
    console.warn("[whatsapp] verify failed:", result.reason);
    return new Response("forbidden", { status: 403 });
  }
  return new Response(result.challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * POST /api/whatsapp/webhook — Inbound messages and delivery statuses.
 *
 * Meta retries on non-2xx within 20s, so we ack fast. Signature is verified
 * against the raw body before any processing. Heavy work could be moved to
 * `after()` later; in Sem 1 the workload is small (Prisma writes).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    console.warn("[whatsapp] signature mismatch");
    return new Response("forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  try {
    const result = await processWebhookPayload(payload);
    if (process.env.NODE_ENV !== "production") {
      console.log("[whatsapp] processed", result);
    }
  } catch (err) {
    // We swallow errors and still return 200 — Meta would retry forever and
    // duplicate `messages[].id` entries collide with our @unique constraint
    // anyway. Real failures are logged for follow-up.
    console.error("[whatsapp] router error", err);
  }

  return new Response("ok", { status: 200 });
}
