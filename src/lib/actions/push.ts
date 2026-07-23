"use server";

import { prisma } from "@/lib/prisma";
import { ensureVapid, sendToSubscriptions, type PushPayload } from "@/lib/push/send";
import { requireAuth, requireMember, can } from "@/lib/auth";
import type { Sede } from "@/generated/prisma/client";

// VAPID setup + delivery live in a plain module so cron jobs and system events
// can send without going through a permission-checked server action.

/** Whether push is configured server-side (VAPID keys present). */
export async function pushConfigured(): Promise<boolean> {
  return ensureVapid();
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
