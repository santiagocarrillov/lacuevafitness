import { prisma } from "@/lib/prisma";
import { pushToMember } from "./send";
import type { Sede } from "@/generated/prisma/client";

/** Roles that should hear about a socio logging their own data. */
const NOTIFIED_ROLES = ["COACH", "NUTRITIONIST", "ADMIN", "OWNER"] as const;

/**
 * Tell the coaching staff a socio just self-reported something, so it gets
 * validated instead of sitting unnoticed in the member's profile.
 *
 * Push delivery is keyed to Member records, and staff have their own ficha, so
 * we notify each staff user through their linked member. Scoped by sede: staff
 * with a sede only hear about their own location; OWNER/ACCOUNTING and other
 * sede-less staff hear about both.
 *
 * Best-effort by design — callers must not let a failed notification break the
 * socio's save.
 */
export async function notifyStaffOfSelfEntry(opts: {
  memberId: string;
  memberName: string;
  memberSede: Sede;
  summary: string;
}): Promise<{ notified: number }> {
  const staff = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: [...NOTIFIED_ROLES] },
      OR: [{ sede: null }, { sede: opts.memberSede }],
    },
    select: { id: true, member: { select: { id: true } } },
  });

  const targets = staff
    .map((s) => s.member?.id)
    .filter((id): id is string => Boolean(id) && id !== opts.memberId);

  if (targets.length === 0) return { notified: 0 };

  const payload = {
    title: "Registro de un socio por validar",
    body: `${opts.memberName}: ${opts.summary}`,
    url: `/dashboard/socios/${opts.memberId}`,
  };

  await Promise.all(
    targets.map((memberId) => pushToMember(memberId, payload).catch(() => undefined)),
  );

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
