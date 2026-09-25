"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { pushToMember } from "@/lib/push/send";
import { isStaffFreeTraining } from "@/lib/staff-free-training";
import {
  coverageState,
  ecuadorDayRange,
  ecuadorLocalToUtc,
  formatAppointmentWhen,
  type AppointmentKind,
  type AppointmentStatus,
  type CoverageState,
} from "@/lib/nutrition/appointments";
import type { Sede, User } from "@/generated/prisma/client";

async function requireScheduler(): Promise<User> {
  const user = await requireAuth();
  if (!can.scheduleNutrition(user)) throw new Error("Sin permisos");
  return user;
}

function revalidateAgenda(memberId?: string) {
  revalidatePath("/dashboard/nutricion");
  revalidatePath("/dashboard/nutricion/cobertura");
  revalidatePath("/portal/hoy");
  revalidatePath("/portal/nutricion");
  if (memberId) revalidatePath(`/dashboard/socios/${memberId}`);
}

// ── Lookups for the booking form ─────────────────────────────────────

/** Socios to book, by any mix of first/last name tokens ("ana pe" finds Ana Pérez). */
export async function searchMembersForNutrition(query: string) {
  const user = await requireScheduler();
  const tokens = query.trim().split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];
  const scope = getSedeScope(user);
  return prisma.member.findMany({
    where: {
      status: { not: "CHURNED" },
      ...(scope ? { OR: [{ sede: scope }, { secondarySede: scope }] } : {}),
      AND: tokens.map((t) => ({
        OR: [
          { firstName: { contains: t, mode: "insensitive" as const } },
          { lastName: { contains: t, mode: "insensitive" as const } },
        ],
      })),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 12,
    select: { id: true, firstName: true, lastName: true, sede: true, status: true },
  });
}

/** Staff who can take consultations (the nutritionist, and OWNER as backup). */
export async function listNutritionStaff() {
  await requireScheduler();
  return prisma.user.findMany({
    where: { active: true, role: { in: ["NUTRITIONIST", "OWNER"] } },
    orderBy: [{ role: "desc" }, { fullName: "asc" }], // NUTRITIONIST before OWNER
    select: { id: true, fullName: true, role: true },
  });
}

// ── CRUD ─────────────────────────────────────────────────────────────

export type AppointmentInput = {
  memberId: string;
  staffUserId?: string | null;
  sede?: Sede | null;
  date: string; // YYYY-MM-DD, Ecuador
  time: string; // HH:MM, Ecuador
  durationMin?: number;
  kind?: AppointmentKind;
  notes?: string | null;
};

async function defaultStaffId(user: User): Promise<string> {
  if (user.role === "NUTRITIONIST") return user.id;
  const nutri = await prisma.user.findFirst({
    where: { active: true, role: "NUTRITIONIST" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return nutri?.id ?? user.id;
}

function cleanDuration(n: number | undefined): number {
  const v = Math.round(n ?? 30);
  if (v < 10 || v > 180) throw new Error("La duración debe estar entre 10 y 180 minutos.");
  return v;
}

export async function createAppointment(input: AppointmentInput) {
  const user = await requireScheduler();
  const member = await prisma.member.findUnique({
    where: { id: input.memberId },
    select: { id: true, sede: true },
  });
  if (!member) throw new Error("Socio no encontrado.");

  const startsAt = ecuadorLocalToUtc(input.date, input.time);
  const appt = await prisma.nutritionAppointment.create({
    data: {
      memberId: member.id,
      staffUserId: input.staffUserId || (await defaultStaffId(user)),
      sede: input.sede ?? member.sede,
      startsAt,
      durationMin: cleanDuration(input.durationMin),
      kind: input.kind ?? "FOLLOW_UP",
      notes: input.notes?.trim() || null,
      createdById: user.id,
    },
  });

  // Tell the socio right away (best-effort — a push failure never blocks booking).
  if (startsAt.getTime() > Date.now()) {
    await pushToMember(member.id, {
      title: "Cita con la nutricionista",
      body: `Te agendamos para el ${formatAppointmentWhen(startsAt)}.`,
      url: "/portal/nutricion",
    }).catch(() => undefined);
  }

  revalidateAgenda(member.id);
  return { id: appt.id };
}

export async function updateAppointment(id: string, input: AppointmentInput) {
  await requireScheduler();
  const prev = await prisma.nutritionAppointment.findUnique({ where: { id } });
  if (!prev) throw new Error("Cita no encontrada.");
  const startsAt = ecuadorLocalToUtc(input.date, input.time);
  const moved = startsAt.getTime() !== prev.startsAt.getTime();

  await prisma.nutritionAppointment.update({
    where: { id },
    data: {
      staffUserId: input.staffUserId || prev.staffUserId,
      sede: input.sede ?? prev.sede,
      startsAt,
      durationMin: cleanDuration(input.durationMin ?? prev.durationMin),
      kind: input.kind ?? prev.kind,
      notes: input.notes === undefined ? prev.notes : input.notes?.trim() || null,
      // A rescheduled appointment deserves a fresh reminder.
      ...(moved ? { reminderSentAt: null } : {}),
    },
  });

  if (moved && prev.status === "SCHEDULED" && startsAt.getTime() > Date.now()) {
    await pushToMember(prev.memberId, {
      title: "Tu cita cambió de hora",
      body: `Nueva fecha: ${formatAppointmentWhen(startsAt)}.`,
      url: "/portal/nutricion",
    }).catch(() => undefined);
  }

  revalidateAgenda(prev.memberId);
}

export async function setAppointmentStatus(id: string, status: AppointmentStatus) {
  await requireScheduler();
  const appt = await prisma.nutritionAppointment.update({
    where: { id },
    data: { status },
    select: { memberId: true, startsAt: true },
  });
  if (status === "CANCELLED" && appt.startsAt.getTime() > Date.now()) {
    await pushToMember(appt.memberId, {
      title: "Cita cancelada",
      body: `Se canceló tu cita del ${formatAppointmentWhen(appt.startsAt)}. Te contactaremos para reagendar.`,
      url: "/portal/nutricion",
    }).catch(() => undefined);
  }
  revalidateAgenda(appt.memberId);
}

// ── Reads ────────────────────────────────────────────────────────────

/** Appointments on the Ecuador days `from`..`to` (inclusive), sede-scoped for ADMIN. */
export async function getAgenda(from: string, to: string, sede?: Sede | null) {
  const user = await requireScheduler();
  const scope = getSedeScope(user) ?? sede ?? null;
  const { start, end } = ecuadorDayRange(from, to);
  return prisma.nutritionAppointment.findMany({
    where: { startsAt: { gte: start, lt: end }, ...(scope ? { sede: scope } : {}) },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      durationMin: true,
      kind: true,
      status: true,
      sede: true,
      notes: true,
      staffUserId: true,
      staff: { select: { fullName: true } },
      member: { select: { id: true, firstName: true, lastName: true, phone: true } },
    },
  });
}

/** One socio's consultation history, newest first (socio page). */
export async function getMemberAppointments(memberId: string) {
  await requireScheduler();
  return prisma.nutritionAppointment.findMany({
    where: { memberId },
    orderBy: { startsAt: "desc" },
    take: 20,
    select: {
      id: true,
      startsAt: true,
      durationMin: true,
      kind: true,
      status: true,
      notes: true,
      staff: { select: { fullName: true } },
    },
  });
}

export type CoverageRow = {
  memberId: string;
  name: string;
  sede: Sede;
  state: CoverageState;
  lastAttended: Date | null;
  nextScheduled: Date | null;
  noShows: number;
};

/**
 * Who has been seen by the nutritionist and who hasn't: every active/trial socio
 * with their last ATTENDED and next SCHEDULED consult. Staff who train for free
 * are left out (they aren't clients to follow up).
 */
export async function getNutritionCoverage(sede?: Sede | null): Promise<CoverageRow[]> {
  const user = await requireScheduler();
  const scope = getSedeScope(user) ?? sede ?? null;
  const now = new Date();

  const [members, attended, upcoming, noShows] = await Promise.all([
    prisma.member.findMany({
      where: {
        status: { in: ["ACTIVE", "TRIAL"] },
        ...(scope ? { sede: scope } : {}),
        // Staff with a linked login are colleagues, not clients.
        OR: [{ userId: null }, { user: { role: "MEMBER" } }],
      },
      select: { id: true, firstName: true, lastName: true, sede: true },
    }),
    prisma.nutritionAppointment.groupBy({
      by: ["memberId"],
      where: { status: "ATTENDED" },
      _max: { startsAt: true },
    }),
    prisma.nutritionAppointment.groupBy({
      by: ["memberId"],
      where: { status: "SCHEDULED", startsAt: { gte: now } },
      _min: { startsAt: true },
    }),
    prisma.nutritionAppointment.groupBy({
      by: ["memberId"],
      where: { status: "NO_SHOW" },
      _count: { _all: true },
    }),
  ]);

  const lastMap = new Map(attended.map((a) => [a.memberId, a._max.startsAt]));
  const nextMap = new Map(upcoming.map((a) => [a.memberId, a._min.startsAt]));
  const noShowMap = new Map(noShows.map((a) => [a.memberId, a._count._all]));

  return members
    .filter((m) => !isStaffFreeTraining(m.firstName, m.lastName))
    .map((m) => {
      const lastAttended = lastMap.get(m.id) ?? null;
      const nextScheduled = nextMap.get(m.id) ?? null;
      return {
        memberId: m.id,
        name: `${m.firstName} ${m.lastName}`.trim(),
        sede: m.sede,
        state: coverageState(lastAttended, nextScheduled, now),
        lastAttended,
        nextScheduled,
        noShows: noShowMap.get(m.id) ?? 0,
      };
    });
}
