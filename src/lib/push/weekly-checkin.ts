import { prisma } from "@/lib/prisma";
import { pushToMember, ensureVapid } from "./send";

/**
 * Weekly "did you weigh in?" nudge — the loop that turns self-logging into a
 * habit. Only reaches socios who opted into notifications AND haven't logged
 * anything themselves in the last 7 days, so consistent loggers are never
 * nagged. Fired by /api/cron/weekly-checkin.
 */
export async function sendWeeklyCheckinReminders(): Promise<{
  candidates: number;
  skippedRecent: number;
  notified: number;
}> {
  if (!ensureVapid()) return { candidates: 0, skippedRecent: 0, notified: 0 };

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Only socios with at least one push subscription — i.e. they opted in.
  const subscribed = await prisma.pushSubscription.findMany({
    select: { memberId: true, member: { select: { id: true, status: true, userId: true } } },
    distinct: ["memberId"],
  });

  const candidates = subscribed
    .map((s) => s.member)
    .filter((m): m is NonNullable<typeof m> =>
      Boolean(m) && (m!.status === "ACTIVE" || m!.status === "TRIAL"));

  if (candidates.length === 0) {
    return { candidates: 0, skippedRecent: 0, notified: 0 };
  }

  // Who already self-logged a measurement in the last 7 days? Leave them alone.
  const recent = await prisma.bodyComposition.findMany({
    where: {
      memberId: { in: candidates.map((m) => m.id) },
      source: "MEMBER",
      measuredAt: { gte: weekAgo },
    },
    select: { memberId: true },
    distinct: ["memberId"],
  });
  const loggedRecently = new Set(recent.map((r) => r.memberId));

  const targets = candidates.filter((m) => !loggedRecently.has(m.id));

  let notified = 0;
  await Promise.all(
    targets.map(async (m) => {
      const res = await pushToMember(m.id, {
        title: "¿Te pesaste esta semana?",
        body: "Registra tu peso y medidas en 20 segundos y mira tu progreso.",
        url: "/portal/progreso",
      }).catch(() => ({ sent: 0 }));
      if (res.sent > 0) notified++;
    }),
  );

  return {
    candidates: candidates.length,
    skippedRecent: loggedRecently.size,
    notified,
  };
}
