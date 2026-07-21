"use server";

import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireMember, can } from "@/lib/auth";
import type { Sede } from "@/generated/prisma/client";

// ── VAPID setup ──────────────────────────────────────────────────────

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:info@lacuevasrxfit.com";

let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidReady = true;
  return true;
}

/** Whether push is configured server-side (VAPID keys present). */
export async function pushConfigured(): Promise<boolean> {
  return Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
}

// ── Member: subscribe / unsubscribe ──────────────────────────────────

type SubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
};

export async function savePushSubscription(sub: SubscriptionInput) {
  const { member } = await requireMember();
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      memberId: member.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: sub.userAgent,
    },
    update: {
      memberId: member.id,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: sub.userAgent,
    },
  });
  return { success: true };
}

export async function removePushSubscription(endpoint: string) {
  await requireMember();
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return { success: true };
}

// ── Send (staff) ─────────────────────────────────────────────────────

type PushPayload = { title: string; body: string; url?: string };

async function sendToSubscriptions(
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

export async function sendPushToMember(memberId: string, payload: PushPayload) {
  const user = await requireAuth();
  if (!can.manageMembers(user)) throw new Error("Sin permisos");
  if (!payload.title?.trim() || !payload.body?.trim()) throw new Error("Título y mensaje requeridos.");

  const subs = await prisma.pushSubscription.findMany({ where: { memberId } });
  return sendToSubscriptions(subs, payload);
}

export async function sendPushBroadcast(payload: PushPayload & { sede?: Sede | null }) {
  const user = await requireAuth();
  if (!can.manageMembers(user)) throw new Error("Sin permisos");
  if (!payload.title?.trim() || !payload.body?.trim()) throw new Error("Título y mensaje requeridos.");

  const subs = await prisma.pushSubscription.findMany({
    where: payload.sede ? { member: { sede: payload.sede } } : {},
  });
  return sendToSubscriptions(subs, { title: payload.title, body: payload.body, url: payload.url });
}

/** Count of distinct members with at least one active push subscription (for the dashboard). */
export async function getPushAudience(): Promise<{ total: number; fitness: number; xtreme: number }> {
  const rows = await prisma.pushSubscription.findMany({
    select: { memberId: true, member: { select: { sede: true } } },
    distinct: ["memberId"],
  });
  return {
    total: rows.length,
    fitness: rows.filter((r) => r.member.sede === "FITNESS_CENTER").length,
    xtreme: rows.filter((r) => r.member.sede === "XTREME").length,
  };
}
