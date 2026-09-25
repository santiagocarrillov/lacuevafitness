import { sendNutritionAppointmentReminders } from "@/lib/push/nutrition-reminders";

// Runs on Node (Prisma + web-push) and must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/nutrition-reminders — the day-before reminder for nutrition
 * appointments. Scheduled in vercel.json for 18:00 Ecuador (23:00 UTC). Same
 * auth as the other crons: Vercel injects `Authorization: Bearer $CRON_SECRET`.
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
    const summary = await sendNutritionAppointmentReminders();
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron/nutrition-reminders] error", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
