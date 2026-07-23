import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * Low-level push delivery. Deliberately a PLAIN module, not a `"use server"`
 * action file: it performs no permission check, so exposing it as a server
 * action would let anyone trigger notifications. Callers (staff actions, cron
 * jobs, system events) are responsible for authorising.
 */

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:info@lacuevasrxfit.com";

let vapidReady = false;
export function ensureVapid(): boolean {
  if (vapidReady) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidReady = true;
  return true;
}

export type PushPayload = { title: string; body: string; url?: string };

export async function sendToSubscriptions(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid()) throw new Error("Push no configurado (faltan claves VAPID).");

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/portal/hoy",
  });

  let sent = 0;
  let failed = 0;
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        // 404/410 → subscription expired; prune it.
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) stale.push(s.id);
      }
    }),
  );

  if (stale.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } });
  }
  return { sent, failed };
}

/** Send to every device of one member. No permission check — see module note. */
export async function pushToMember(memberId: string, payload: PushPayload) {
  if (!ensureVapid()) return { sent: 0, failed: 0 };
  const subs = await prisma.pushSubscription.findMany({ where: { memberId } });
  if (subs.length === 0) return { sent: 0, failed: 0 };
  return sendToSubscriptions(subs, payload);
}
