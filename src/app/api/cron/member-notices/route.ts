import { runNotices } from "@/lib/whatsapp/member-notices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/member-notices — the day's automatic WhatsApp notices to
 * socios (days without coming, < 3 visits a week, birthdays, nutrition). Only
 * kinds switched on in WhatsApp › Avisos AND approved by Meta are sent; the
 * rest are only counted. Scheduled in vercel.json for 10:00 Ecuador (15:00 UTC).
 * Idempotent: every notice has a unique key. Never call it to "check" — it sends real messages.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("forbidden", { status: 403 });
  }
  try {
    const { byKind } = await runNotices();
    console.log("[cron/member-notices]", JSON.stringify(byKind));
    return Response.json({ ok: true, byKind });
  } catch (err) {
    console.error("[cron/member-notices] error", err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "error" }, { status: 500 });
  }
}
