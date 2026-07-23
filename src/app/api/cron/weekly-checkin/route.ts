import { sendWeeklyCheckinReminders } from "@/lib/push/weekly-checkin";

// Runs on Node (Prisma + web-push) and must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/weekly-checkin — weekly nudge asking socios to log their
 * weight/measurements. Scheduled in vercel.json for Sunday 09:00 Ecuador
 * (14:00 UTC). Same auth as the other cron: Vercel injects
 * `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
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
    const summary = await sendWeeklyCheckinReminders();
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron/weekly-checkin] error", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
