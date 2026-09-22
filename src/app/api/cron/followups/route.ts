import { processDueFollowups } from "@/lib/whatsapp/sequences";
import { markMissedTrials } from "@/lib/leads/trial-attendance";
import { answerUnansweredInbounds } from "@/lib/whatsapp/unanswered";

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
    // Appointments nobody registered become TRIAL_NO_SHOW y, de paso, se les
    // programa el rescate. Va ANTES de processDueFollowups a propósito: así un
    // plantón de hace rato puede salir en esta misma corrida.
    const noShows = await markMissedTrials();
    const summary = await processDueFollowups();
    // Al final: quien escribió y se quedó sin respuesta. Va después de los
    // followups para que una conversación que acaba de recibir uno no entre.
    const unanswered = await answerUnansweredInbounds();
    return Response.json({
      ok: true,
      ...summary,
      noShows: noShows.marked,
      noShowRecoveries: noShows.recoveries,
      unansweredFound: unanswered.found,
      unansweredAnswered: unanswered.answered,
    });
  } catch (err) {
    console.error("[cron/followups] error", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
