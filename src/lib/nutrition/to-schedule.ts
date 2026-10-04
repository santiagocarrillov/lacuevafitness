// "Por agendar" — who the nutritionist must see and by when (server, no auth).
//  · TRIAL: everyone who paid the two-week evaluation ($9) and has no consult
//    yet, due the day before the trial ends (Friday if that's a weekend).
//  · MEASUREMENT: active paying socios with no weigh-in in two SRXFIT cycles
//    (18 weeks), due before the third one ends (20 weeks).
// A socio with a future appointment is already taken care of and drops out.

import { prisma } from "@/lib/prisma";
import type { Sede } from "@/generated/prisma/client";
import { OFFICIAL_ENTRY_WHERE } from "@/lib/entry-source";
import { isStaffFreeTraining } from "@/lib/staff-free-training";
import { ecuadorDateString } from "@/lib/timezone";
import { addDays } from "@/lib/nutrition/appointments";
import { MEASUREMENT_DEADLINE_DAYS, MEASUREMENT_DUE_DAYS, trialDeadline } from "@/lib/nutrition/slots";

export type ToScheduleReason = "TRIAL" | "MEASUREMENT";

export type ToScheduleItem = {
  memberId: string;
  name: string;
  firstName: string;
  phone: string | null;
  sede: Sede;
  reason: ToScheduleReason;
  deadline: string; // YYYY-MM-DD
  /** Days until the deadline (negative = late). */
  daysLeft: number;
  detail: string;
  invite: { code: string; createdAt: Date } | null;
};

const DAY = 86_400_000;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DAY);

export async function toSchedule(opts: { now?: Date; sede?: Sede | null } = {}): Promise<ToScheduleItem[]> {
  const now = opts.now ?? new Date();
  const today = ecuadorDateString(now);
  const sedeWhere = opts.sede ? { sede: opts.sede } : {};
  const notStaff = { OR: [{ userId: null }, { user: { role: "MEMBER" as const } }] };

  const [trials, payers, upcoming, invites] = await Promise.all([
    prisma.membership.findMany({
      where: {
        state: "ACTIVE",
        plan: { billingCycle: "TRIAL" },
        endsAt: { gte: new Date(now.getTime() - 3 * DAY) },
        member: { status: "TRIAL", ...sedeWhere, ...notStaff },
      },
      include: { member: { select: { id: true, firstName: true, lastName: true, phone: true, sede: true } } },
    }),
    prisma.member.findMany({
      where: {
        status: "ACTIVE",
        ...sedeWhere,
        ...notStaff,
        memberships: { some: { state: "ACTIVE", endsAt: { gte: now }, plan: { billingCycle: { notIn: ["TRIAL", "ONE_TIME"] } } } },
      },
      select: {
        id: true, firstName: true, lastName: true, phone: true, sede: true, joinedAt: true,
        bodyCompositions: { where: OFFICIAL_ENTRY_WHERE, orderBy: { measuredAt: "desc" }, take: 1, select: { measuredAt: true } },
        nutritionAppointments: { where: { status: "ATTENDED" }, orderBy: { startsAt: "desc" }, take: 1, select: { startsAt: true } },
      },
    }),
    prisma.nutritionAppointment.findMany({
      where: { status: "SCHEDULED", startsAt: { gte: now } },
      select: { memberId: true },
    }),
    prisma.nutritionBookingInvite.findMany({
      where: { appointmentId: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      select: { memberId: true, reason: true, code: true, createdAt: true },
    }),
  ]);
  const booked = new Set(upcoming.map((u) => u.memberId));
  const inviteFor = (memberId: string, reason: string) => invites.find((i) => i.memberId === memberId && i.reason === reason) ?? null;

  // Trials already seen since the trial started don't need another consult.
  const seen = trials.length
    ? await prisma.nutritionAppointment.findMany({
        where: { status: "ATTENDED", memberId: { in: trials.map((t) => t.memberId) } },
        select: { memberId: true, startsAt: true },
      })
    : [];

  const out: ToScheduleItem[] = [];
  for (const t of trials) {
    const m = t.member;
    if (booked.has(m.id) || isStaffFreeTraining(m.firstName, m.lastName)) continue;
    if (seen.some((s) => s.memberId === m.id && s.startsAt >= t.startsAt)) continue;
    const deadline = trialDeadline(ecuadorDateString(t.endsAt));
    out.push({
      memberId: m.id, name: `${m.firstName} ${m.lastName}`.trim(), firstName: m.firstName, phone: m.phone, sede: m.sede,
      reason: "TRIAL", deadline, daysLeft: dayDiff(deadline, today),
      detail: `Evaluación de $9 · vence el ${ecuadorDateString(t.endsAt)}`,
      invite: inviteFor(m.id, "TRIAL"),
    });
  }
  for (const m of payers) {
    if (booked.has(m.id) || isStaffFreeTraining(m.firstName, m.lastName)) continue;
    const last = [m.bodyCompositions[0]?.measuredAt, m.nutritionAppointments[0]?.startsAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
    const reference = last ?? m.joinedAt;
    const refDay = ecuadorDateString(reference);
    const since = dayDiff(today, refDay);
    if (since < MEASUREMENT_DUE_DAYS) continue;
    const deadline = addDays(refDay, MEASUREMENT_DEADLINE_DAYS);
    out.push({
      memberId: m.id, name: `${m.firstName} ${m.lastName}`.trim(), firstName: m.firstName, phone: m.phone, sede: m.sede,
      reason: "MEASUREMENT", deadline, daysLeft: dayDiff(deadline, today),
      detail: last ? `Última medición hace ${Math.floor(since / 7)} semanas` : `Sin mediciones desde que entró (hace ${Math.floor(since / 7)} semanas)`,
      invite: inviteFor(m.id, "MEASUREMENT"),
    });
  }
  return out.sort((a, b) => a.deadline.localeCompare(b.deadline) || a.name.localeCompare(b.name));
}
