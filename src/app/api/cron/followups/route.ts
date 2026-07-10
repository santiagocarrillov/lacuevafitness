import { processDueFollowups } from "@/lib/whatsapp/sequences";

// Runs on Node (Prisma + crypto) and must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/followups — fire due WhatsApp followups (reminders, nudges).
 *
 * Invoked by Vercel Cron (see vercel.json). Vercel injects
 * `Authorization: Bearer $CRON_SECRET` when the CRON_SECRET env var is set;
 * we reject anything else so the endpoint isn't publicly triggerable.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("forbidden", { status: 403 });
    }
  }

  try {
    const summary = await processDueFollowups();
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron/followups] error", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
