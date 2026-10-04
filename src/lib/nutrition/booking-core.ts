// Booking core (server, no auth — callers check who may book for whom).
// Used by the staff panel, the portal and the public /cita/[código] page.

import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import type { AppointmentKind, Prisma, Sede } from "@/generated/prisma/client";
import { pushToMember } from "@/lib/push/send";
import { notifyUsers } from "@/lib/push/notify-staff";
import { ecuadorDateString } from "@/lib/timezone";
import { CANONICAL_SITE_URL } from "@/lib/site-url";
import { formatAppointmentWhen } from "@/lib/nutrition/appointments";
import { bookingCode, computeSlots, type SedeKey, type SlotDay } from "@/lib/nutrition/slots";

type Db = Prisma.TransactionClient | typeof prisma;

const SEDE_NAMES: Record<Sede, string> = { FITNESS_CENTER: "La Cueva Fitness Center", XTREME: "La Cueva Xtreme" };
export const sedeName = (s: Sede) => SEDE_NAMES[s];

/** Open slots from `fromDate` for `days` days (optionally one sede). */
export async function loadSlots(db: Db, opts: { fromDate?: string; days?: number; sede?: SedeKey | null; now?: Date } = {}): Promise<SlotDay[]> {
  const now = opts.now ?? new Date();
  const fromDate = opts.fromDate ?? ecuadorDateString(now);
  const days = opts.days ?? 14;
  const horizon = new Date(now.getTime() + (days + 2) * 86_400_000);
  const [windows, busy, timeOff] = await Promise.all([
    db.nutritionAvailability.findMany({ where: { active: true, staff: { active: true } } }),
    db.nutritionAppointment.findMany({
      where: { status: "SCHEDULED", startsAt: { gte: new Date(now.getTime() - 86_400_000), lte: horizon } },
      select: { staffUserId: true, startsAt: true, durationMin: true },
    }),
    db.nutritionTimeOff.findMany({ where: { active: true, endsAt: { gte: now }, startsAt: { lte: horizon } } }),
  ]);
  return computeSlots({ windows, busy, timeOff, fromDate, days, now, sede: opts.sede ?? null });
}

export type BookResult = { appointmentId: string; startsAt: Date; sede: Sede; moved: boolean };

/**
 * Books (or moves) a member's consultation into an open slot. Serialized per
 * nutritionist so two people can't take the same slot. A member with a future
 * SCHEDULED consult gets it moved instead of a second one.
 */
export async function bookSlot(p: {
  memberId: string;
  startsAt: string; // ISO from the slot list
  sede: SedeKey;
  staffUserId: string;
  kind?: AppointmentKind;
  source: "MEMBER" | "INVITE" | "STAFF";
  createdById?: string | null;
  inviteId?: string;
}): Promise<BookResult> {
  const startsAt = new Date(p.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new Error("Horario inválido.");

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nutri-book-${p.staffUserId}`}))`;
    const day = ecuadorDateString(startsAt);
    const open = await loadSlots(tx, { fromDate: day, days: 1, sede: p.sede });
    const slot = open[0]?.slots.find((s) => s.startsAt === startsAt.toISOString() && s.staffUserId === p.staffUserId);
    if (!slot) throw new Error("Ese horario ya no está disponible: elige otro.");

    const [existing, attended] = await Promise.all([
      tx.nutritionAppointment.findFirst({
        where: { memberId: p.memberId, status: "SCHEDULED", startsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
      }),
      tx.nutritionAppointment.count({ where: { memberId: p.memberId, status: "ATTENDED" } }),
    ]);
    const note = p.source === "STAFF" ? null : "Agendada por el socio";
    const appt = existing
      ? await tx.nutritionAppointment.update({
          where: { id: existing.id },
          data: { startsAt, sede: p.sede, staffUserId: p.staffUserId, durationMin: slot.durationMin, reminderSentAt: null },
        })
      : await tx.nutritionAppointment.create({
          data: {
            memberId: p.memberId,
            staffUserId: p.staffUserId,
            sede: p.sede,
            startsAt,
            durationMin: slot.durationMin,
            kind: p.kind ?? (attended ? "FOLLOW_UP" : "INITIAL"),
            notes: note,
            createdById: p.createdById ?? null,
          },
        });
    if (p.inviteId) await tx.nutritionBookingInvite.update({ where: { id: p.inviteId }, data: { appointmentId: appt.id } });
    return { appointmentId: appt.id, startsAt, sede: p.sede as Sede, moved: !!existing };
  });

  // Best-effort notices: a push failure never undoes the booking.
  const when = formatAppointmentWhen(startsAt);
  const member = await prisma.member.findUnique({ where: { id: p.memberId }, select: { firstName: true, lastName: true } });
  await Promise.all([
    pushToMember(p.memberId, {
      title: result.moved ? "Tu cita cambió de hora" : "Cita con la nutricionista",
      body: `${when} en ${sedeName(result.sede)}.`,
      url: "/portal/nutricion",
    }).catch(() => undefined),
    p.source !== "STAFF"
      ? notifyUsers([p.staffUserId], {
          title: result.moved ? "Un socio cambió su cita" : "Nueva cita agendada",
          body: `${member?.firstName ?? ""} ${member?.lastName ?? ""} · ${when} · ${sedeName(result.sede)}`.trim(),
          url: "/dashboard/nutricion",
        }).catch(() => undefined)
      : undefined,
  ]);
  return result;
}

/** A fresh (or still valid, unused) booking link for one member. */
export async function ensureInvite(p: {
  memberId: string;
  reason: "TRIAL" | "MEASUREMENT" | "MANUAL";
  kind?: AppointmentKind;
  deadline?: string | null; // YYYY-MM-DD
  createdById?: string | null;
}) {
  const now = new Date();
  const existing = await prisma.nutritionBookingInvite.findFirst({
    where: { memberId: p.memberId, reason: p.reason, appointmentId: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  const deadline = p.deadline ? new Date(`${p.deadline}T00:00:00.000Z`) : null;
  // Valid two weeks, or until two days after the deadline.
  const expiresAt = deadline ? new Date(deadline.getTime() + 2 * 86_400_000) : new Date(now.getTime() + 14 * 86_400_000);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.nutritionBookingInvite.create({
        data: {
          code: bookingCode((n) => randomInt(n)),
          memberId: p.memberId,
          reason: p.reason,
          kind: p.kind ?? "FOLLOW_UP",
          deadline,
          expiresAt: expiresAt.getTime() > now.getTime() ? expiresAt : new Date(now.getTime() + 3 * 86_400_000),
          createdById: p.createdById ?? null,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e; // code collision: try again
    }
  }
  throw new Error("No se pudo crear el enlace.");
}

export const inviteUrl = (code: string) => `${CANONICAL_SITE_URL}/cita/${code}`;
