import { generateAutoTasks } from "@/lib/tasks/auto";

// Runs on Node (Prisma + web-push) and must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/tasks-auto — the day's automatic tasks (evaluations, renewals,
 * socios who stopped coming) into each sede's front-desk pool. Scheduled in
 * vercel.json for 5:00 Ecuador (10:00 UTC). Idempotent: every task carries an
 * autoKey, so a retry creates nothing new.
 * Same auth as the other crons: Vercel injects `Authorization: Bearer $CRON_SECRET`.
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
    const { plans, ...summary } = await generateAutoTasks();
    console.log("[cron/tasks-auto]", JSON.stringify(summary));
    return Response.json({ ok: true, ...summary, titles: plans.map((p) => p.title) });
  } catch (err) {
    console.error("[cron/tasks-auto] error", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
