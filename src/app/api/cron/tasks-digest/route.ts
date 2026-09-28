import { sendTaskDigest } from "@/lib/tasks/digest";

// Runs on Node (Prisma + web-push) and must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/tasks-digest — the morning push with each person's tasks
 * for the day. Scheduled in vercel.json for 7:30 Ecuador (12:30 UTC). Sends
 * real notifications: never call it by hand to "check" it.
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
    const summary = await sendTaskDigest();
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron/tasks-digest] error", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
