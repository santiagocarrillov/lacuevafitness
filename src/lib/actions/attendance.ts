"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Sede, MembershipState } from "@/generated/prisma/client";
import { updateChallengeProgress } from "./challenges";
import { requireAuth, can } from "@/lib/auth";

// ── Helpers ─────────────────────────────────────────────────────────

function todayDate() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const DAY_MAP: Record<number, string> = {
  0: "SUN", 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI", 6: "SAT",
};

// ── Get or create today's class session ─────────────────────────────

export async function getOrCreateTodaySession(scheduleId: string) {
  const schedule = await prisma.classSchedule.findUniqueOrThrow({
    where: { id: scheduleId },
  });

  const today = todayDate();
  const [hours, minutes] = schedule.startTime.split(":").map(Number);
  const startAt = new Date(today);
  startAt.setHours(hours, minutes, 0, 0);

  let session = await prisma.classSession.findUnique({
    where: { scheduleId_date: { scheduleId, date: today } },
    include: {
      attendance: { include: { member: true } },
      coachConfirmation: true,
      schedule: true,
    },
  });

  if (!session) {
    session = await prisma.classSession.create({
      data: {
        scheduleId,
        sede: schedule.sede,
        date: today,
        startAt,
      },
      include: {
        attendance: { include: { member: true } },
        coachConfirmation: true,
        schedule: true,
      },
    });
  }

  return session;
}

// ── List today's schedules for a sede ───────────────────────────────

export async function getTodaySchedules(sede: Sede) {
  const dayOfWeek = DAY_MAP[new Date().getDay()];
  if (!dayOfWeek) return [];

  const schedules = await prisma.classSchedule.findMany({
    where: {
      sede,
      dayOfWeek: dayOfWeek as any,
      active: true,
    },
    orderBy: { startTime: "asc" },
    include: {
      sessions: {
        where: { date: todayDate() },
        include: {
          attendance: true,
          coachConfirmation: true,
        },
      },
    },
  });

  return schedules.map((s) => {
    const session = s.sessions[0];
    return {
      scheduleId: s.id,
      name: s.name,
      startTime: s.startTime,
      capacity: s.capacity,
      sessionId: session?.id ?? null,
      attendanceCount: session?.attendance.length ?? 0,
      coachConfirmed: !!session?.coachConfirmation,
      coachCount: session?.coachConfirmation?.count ?? null,
      discrepancy: session?.discrepancy ?? false,
    };
  });
}

// ── Get active members for a sede (for the dropdown) ────────────────

export async function getActiveMembers(sede: Sede) {
  return prisma.member.findMany({
    where: {
      sede,
      status: { in: ["ACTIVE", "TRIAL"] },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      memberships: {
        where: { state: MembershipState.ACTIVE },
        orderBy: { endsAt: "desc" },
        take: 1,
        select: { endsAt: true, state: true },
      },
    },
  });
}

// ── Record attendance ───────────────────────────────────────────────

export async function recordAttendance(
  scheduleId: string,
  memberIds: string[],
) {
  const user = await requireAuth();
  if (!can.recordAttendance(user)) {
    throw new Error("No tienes permiso para registrar asistencia.");
  }

  const session = await getOrCreateTodaySession(scheduleId);

  // Check for expired memberships
  const members = await prisma.member.findMany({
    where: { id: { in: memberIds } },
    include: {
      memberships: {
        where: { state: MembershipState.ACTIVE },
        orderBy: { endsAt: "desc" },
        take: 1,
      },
    },
  });

  const now = new Date();
  const expiredAlerts: string[] = [];

  const records = memberIds.map((memberId) => {
    const member = members.find((m) => m.id === memberId);
    const activeMembership = member?.memberships[0];
    const isExpired = !activeMembership || activeMembership.endsAt < now;

    if (isExpired && member) {
      expiredAlerts.push(`${member.firstName} ${member.lastName}`);
    }

    return {
      memberId,
      classSessionId: session.id,
      expiredMembershipAlert: isExpired,
    };
  });

  // Upsert attendance records (skip duplicates)
  for (const record of records) {
    await prisma.attendance.upsert({
      where: {
        memberId_classSessionId: {
          memberId: record.memberId,
          classSessionId: record.classSessionId,
        },
      },
      update: {},
      create: record,
    });
  }

  // Update admin count on session
  const totalAttendance = await prisma.attendance.count({
    where: { classSessionId: session.id },
  });

  await prisma.classSession.update({
    where: { id: session.id },
    data: {
      adminCount: totalAttendance,
      discrepancy: session.coachConfirmation
        ? totalAttendance !== session.coachConfirmation.count
        : false,
    },
  });

  // Update challenge progress for each member
  for (const memberId of memberIds) {
    await updateChallengeProgress(memberId).catch(() => {});
  }

  revalidatePath("/dashboard/asistencia");
  revalidatePath("/dashboard");

  return {
    success: true,
    attendanceCount: totalAttendance,
    expiredAlerts,
  };
}

// ── Remove attendance ───────────────────────────────────────────────

export async function removeAttendance(
  classSessionId: string,
  memberId: string,
) {
  const user = await requireAuth();
  if (!can.recordAttendance(user)) {
    throw new Error("No tienes permiso para modificar asistencia.");
  }

  await prisma.attendance.deleteMany({
    where: { classSessionId, memberId },
  });

  const totalAttendance = await prisma.attendance.count({
    where: { classSessionId },
  });

  const session = await prisma.classSession.update({
    where: { id: classSessionId },
    data: {
      adminCount: totalAttendance,
    },
    include: { coachConfirmation: true },
  });

  if (session.coachConfirmation) {
    await prisma.classSession.update({
      where: { id: classSessionId },
      data: {
        discrepancy: totalAttendance !== session.coachConfirmation.count,
      },
    });
  }

  revalidatePath("/dashboard/asistencia");
  revalidatePath("/dashboard");

  return { success: true, attendanceCount: totalAttendance };
}

// ── Coach confirmation ──────────────────────────────────────────────

export async function confirmCoachCount(
  classSessionId: string,
  _unusedCoachId: string, // kept for client-side compatibility, ignored
  count: number,
  notes?: string,
) {
  const user = await requireAuth();
  if (!can.confirmCoach(user)) {
    throw new Error("No tienes permiso para confirmar conteo de coach.");
  }

  // Check existing confirmation — only coach who made it or OWNER can edit
  const existing = await prisma.coachConfirmation.findUnique({
    where: { classSessionId },
  });
  if (existing && existing.coachUserId !== user.id && user.role !== "OWNER") {
    throw new Error("Solo el coach que confirmó puede modificarlo.");
  }

  // Use logged-in user as coach
  const coachUserId = user.id;

  await prisma.coachConfirmation.upsert({
    where: { classSessionId },
    update: { count, notes, coachUserId },
    create: { classSessionId, coachUserId, count, notes },
  });

  const session = await prisma.classSession.update({
    where: { id: classSessionId },
    data: {
      coachCount: count,
      discrepancy: false, // Will re-check below
    },
    include: { attendance: true },
  });

  const adminCount = session.attendance.length;
  if (adminCount !== count) {
    await prisma.classSession.update({
      where: { id: classSessionId },
      data: { discrepancy: true },
    });
  }

  revalidatePath("/dashboard/asistencia");
  revalidatePath("/dashboard");

  return {
    success: true,
    adminCount,
    coachCount: count,
    discrepancy: adminCount !== count,
  };
}

// ── Get session detail (for coach view) ─────────────────────────────

export async function getSessionDetail(sessionId: string) {
  return prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      schedule: true,
      attendance: {
        include: { member: true },
        orderBy: { recordedAt: "asc" },
      },
      coachConfirmation: true,
    },
  });
}

// ── Dashboard stats ─────────────────────────────────────────────────

export async function getDashboardStats(sede?: Sede) {
  const today = todayDate();
  const sedeFilter = sede ? { sede } : {};

  const [
    activeMembers,
    todayAttendance,
    expiredMemberships,
    upcomingRenewals,
    todayDiscrepancies,
  ] = await Promise.all([
    prisma.member.count({
      where: { ...sedeFilter, status: { in: ["ACTIVE", "TRIAL"] } },
    }),
    prisma.attendance.count({
      where: {
        classSession: { ...sedeFilter, date: today },
      },
    }),
    prisma.membership.count({
      where: {
        member: sedeFilter,
        state: MembershipState.ACTIVE,
        endsAt: { lt: new Date() },
      },
    }),
    prisma.membership.count({
      where: {
        member: sedeFilter,
        state: MembershipState.ACTIVE,
        endsAt: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.classSession.count({
      where: { ...sedeFilter, date: today, discrepancy: true },
    }),
  ]);

  return {
    activeMembers,
    todayAttendance,
    expiredMemberships,
    upcomingRenewals,
    todayDiscrepancies,
  };
}
