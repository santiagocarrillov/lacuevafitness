import { prisma } from "@/lib/prisma";
import { pushToMember, type PushPayload } from "./send";
import type { Sede, UserRole } from "@/generated/prisma/client";

/**
 * Generic staff push: every active user with one of `roles`, scoped to `sede`
 * (sede-less staff hear about both), delivered through their linked member
 * record. Best-effort — callers `.catch()` it.
 */
export async function notifyStaff(opts: {
  roles: UserRole[];
  sede: Sede | null;
  payload: PushPayload;
  excludeMemberId?: string;
}): Promise<{ notified: number }> {
  const staff = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: opts.roles },
      ...(opts.sede ? { OR: [{ sede: null }, { sede: opts.sede }] } : {}),
    },
    select: { member: { select: { id: true } } },
  });
  const targets = staff
    .map((s) => s.member?.id)
    .filter((id): id is string => Boolean(id) && id !== opts.excludeMemberId);
  await Promise.all(targets.map((id) => pushToMember(id, opts.payload).catch(() => undefined)));
  return { notified: targets.length };
}

/** Quién atiende el inbox de ventas. Coaches y nutrición no entran aquí. */
const INBOX_ROLES = ["ADMIN", "OWNER"] as const;

/**
 * Avisar que el bot escaló una conversación y está esperando a una persona.
 *
 * Sin esto el handoff era un agujero negro: el bot mandaba "en un momento un
 * asesor te atiende", se ponía en pausa y nadie se enteraba. El 21 sep 2026
 * había 4 leads así, uno esperando 37 horas, varios preguntando qué sede les
 * conviene. Nadie los recogía porque nada los señalaba.
 *
 * Best-effort, igual que el resto de notificaciones: si falla el push, la
 * conversación igual quedó marcada y el lead igual recibió su mensaje.
 */
export async function notifyStaffOfBotHandoff(opts: {
  leadName: string;
  sede: Sede;
  /** Última cosa que escribió el lead, para que el aviso diga algo útil. */
  lastMessage: string | null;
}): Promise<{ notified: number }> {
  const staff = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: [...INBOX_ROLES] },
      OR: [{ sede: null }, { sede: opts.sede }],
    },
    select: { member: { select: { id: true } } },
  });

  const targets = staff
    .map((s) => s.member?.id)
    .filter((id): id is string => Boolean(id));
  if (targets.length === 0) return { notified: 0 };

  const snippet = opts.lastMessage?.replace(/\s+/g, " ").trim().slice(0, 90);
  const payload = {
    title: "El bot pasó una conversación a una persona",
    body: snippet ? `${opts.leadName}: "${snippet}"` : `${opts.leadName} está esperando respuesta.`,
    url: "/dashboard/comunicacion",
  };

  await Promise.all(targets.map((id) => pushToMember(id, payload).catch(() => undefined)));
  return { notified: targets.length };
}

/**
 * Push to specific staff users (task assigned, comment, mention). Like the
 * rest, it reaches staff through their linked member record, so only people
 * who turned on "Activar avisos" hear it. Best-effort: never throws.
 */
export async function notifyUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<{ notified: number }> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return { notified: 0 };
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, active: true },
      select: { member: { select: { id: true } } },
    });
    const targets = users.map((u) => u.member?.id).filter((id): id is string => Boolean(id));
    await Promise.all(targets.map((id) => pushToMember(id, payload).catch(() => undefined)));
    return { notified: targets.length };
  } catch {
    return { notified: 0 };
  }
}
