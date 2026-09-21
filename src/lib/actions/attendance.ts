"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Sede, MembershipState } from "@/generated/prisma/client";
import { updateChallengeProgress } from "./challenges";
import { requireAuth, can } from "@/lib/auth";
import { ACTIVE_BASE, TRAINING_BASE } from "@/lib/member-status";
import { markLeadAttended } from "@/lib/leads/trial-attendance";
import {
  todayDateUtc, todayDayOfWeekEcuador, ecuadorDateAt as ecuadorDateAtTz,
  isAttendanceWindowOpen,
} from "@/lib/timezone";

const todayDate = todayDateUtc;
const todayDayOfWeek = todayDayOfWeekEcuador;
const ecuadorDateAt = ecuadorDateAtTz;

// ── Get or create today's class session ─────────────────────────────

export async function getOrCreateTodaySession(scheduleId: string) {
  const schedule = await prisma.classSchedule.findUniqueOrThrow({
    where: { id: scheduleId },
  });

  const today = todayDate();
  const [hours, minutes] = schedule.startTime.split(":").map(Number);
  const startAt = ecuadorDateAt(today, hours, minutes);

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
  const dayOfWeek = todayDayOfWeek();

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
      // A member can train at this sede as their primary OR secondary sede, so
      // staff at either location can register their attendance.
      OR: [{ sede }, { secondarySede: sede }],
      status: { in: TRAINING_BASE },
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

// ── Search active members across ALL sedes ──────────────────────────
// For registering attendance of a socio who belongs to the other sede (an
// occasional visitor). Intentionally NOT sede-scoped. Staff only.
export async function searchMembersAllSedes(query: string) {
  const user = await requireAuth();
  if (user.role === "MEMBER") throw new Error("Sin permisos");
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.member.findMany({
    where: {
      status: { in: TRAINING_BASE },
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 15,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      sede: true,
      memberships: {
        where: { state: MembershipState.ACTIVE },
        orderBy: { endsAt: "desc" },
        take: 1,
        select: { endsAt: true, state: true },
      },
    },
  });
}

// ── Evaluaciones de hoy (leads del embudo) ──────────────────────────

export type TrialLeadRow = {
  leadId: string;
  name: string;
  /** Datos crudos del lead, para precargar el alta y que se puedan corregir. */
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  /** Booked time, ISO. */
  scheduledAt: string;
  stage: string;
  /** Ad that brought them in, when the lead came from a click-to-WhatsApp ad. */
  adHeadline: string | null;
  /** Already registered today — kept in the list so staff can see it landed. */
  attended: boolean;
};

/**
 * Leads booked for an evaluation today at this sede.
 *
 * This is the missing link staff kept asking about: the bot books the
 * appointment, and until now the person at the counter had no way to say
 * "she came" without opening the CRM separately.
 */
export async function getTodayTrialLeads(sede: Sede): Promise<TrialLeadRow[]> {
  const user = await requireAuth();
  if (user.role === "MEMBER") throw new Error("Sin permisos");

  const dayStart = ecuadorDateAt(todayDate(), 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const leads = await prisma.lead.findMany({
    where: {
      sede,
      trialScheduledAt: { gte: dayStart, lt: dayEnd },
      stage: { notIn: ["LOST"] },
    },
    orderBy: { trialScheduledAt: "asc" },
    select: {
      id: true, firstName: true, lastName: true, email: true, phone: true,
      trialScheduledAt: true, stage: true, adHeadline: true, trialAttended: true,
    },
  });

  return leads.map((l) => ({
    leadId: l.id,
    name: [l.firstName, l.lastName].filter(Boolean).join(" ") || "Sin nombre",
    firstName: l.firstName,
    lastName: l.lastName,
    email: l.email,
    phone: l.phone,
    scheduledAt: l.trialScheduledAt!.toISOString(),
    stage: l.stage,
    adHeadline: l.adHeadline,
    attended: l.trialAttended === true,
  }));
}

/** Datos con los que se da de alta al socio al registrar su evaluación. */
export type TrialMemberDraft = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  /** yyyy-mm-dd */
  dateOfBirth?: string;
};

const clean = (v?: string | null) => v?.trim() || undefined;

/**
 * Register a lead's evaluation visit.
 *
 * One click does three things that used to be three systems: it creates (or
 * reuses) the Member row that links lead → socio, writes the visit into the same
 * Attendance table as every other athlete, and moves the funnel to
 * TRIAL_ATTENDED. The member is status TRIAL, so from tomorrow they show up in
 * the normal attendance search for the rest of their two weeks.
 *
 * `draft` son los datos que el admin confirma en el mostrador. Sin él, el socio
 * heredaba el nombre del perfil de WhatsApp — que suele ser basura ("🌒..H..🪐⏳")
 * y se quedaba pegado en reportes, portal y facturación. Nombre y apellido son
 * obligatorios; el resto se completa cuando cierre la venta. Los datos corregidos
 * se copian también al Lead, para que el embudo deje de mostrar el alias.
 */
export async function recordTrialAttendance(
  scheduleId: string,
  leadId: string,
  draft: TrialMemberDraft,
): Promise<{ memberId: string; memberName: string }> {
  const user = await requireAuth();
  if (!can.recordAttendance(user)) {
    throw new Error("No tienes permiso para registrar asistencia.");
  }
  if (!isAttendanceWindowOpen()) {
    throw new Error("La ventana de registro está cerrada (cierra a las 9:30pm Ecuador). El siguiente día empieza a las 12:00 AM.");
  }

  const firstName = draft.firstName?.trim() ?? "";
  const lastName = draft.lastName?.trim() ?? "";
  if (firstName.length < 2 || lastName.length < 2) {
    throw new Error("Nombre y apellido son obligatorios para dar de alta al socio.");
  }
  const email = clean(draft.email);
  const phone = clean(draft.phone);
  const dateOfBirth = clean(draft.dateOfBirth);

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { member: true },
  });
  if (!lead) throw new Error("Lead no encontrado.");

  // Member.email es @unique: se avisa antes de entrar a la transacción, para que
  // el admin corrija el campo en vez de recibir un error de Prisma.
  if (email) {
    const taken = await prisma.member.findUnique({ where: { email } });
    if (taken && taken.id !== lead.member?.id) {
      throw new Error(
        `Ya existe un socio con el email ${email} (${taken.firstName} ${taken.lastName}).`,
      );
    }
  }

  const session = await getOrCreateTodaySession(scheduleId);

  const memberId = await prisma.$transaction(async (tx) => {
    // The lead may already be a socio (came back, or was converted earlier).
    let member = lead.member;
    if (member) {
      // Ya era socio (volvió, o alguien lo creó antes): se le corrigen los datos
      // con lo que el admin acaba de confirmar, sin pisar nada con vacío.
      member = await tx.member.update({
        where: { id: member.id },
        data: {
          firstName,
          lastName,
          email: email ?? undefined,
          phone: phone ?? undefined,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        },
      });
    } else {
      member = await tx.member.create({
        data: {
          firstName,
          lastName,
          email,
          phone: phone ?? lead.phone,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
          sede: lead.sede,
          status: "TRIAL",
          leadId: lead.id,
          notes: "Creado al registrar su evaluación de 2 semanas ($9).",
        },
      });
    }

    // El embudo se queda con el nombre real, no con el alias de WhatsApp.
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        firstName,
        lastName,
        email: email ?? lead.email ?? undefined,
        phone: phone ?? lead.phone ?? undefined,
      },
    });

    await tx.attendance.upsert({
      where: { memberId_classSessionId: { memberId: member.id, classSessionId: session.id } },
      update: {},
      // Not an expired membership — they are inside their paid evaluation.
      create: { memberId: member.id, classSessionId: session.id, expiredMembershipAlert: false, recordedByUserId: user.id },
    });

    await markLeadAttended(tx, lead.id, {
      userId: user.id,
      note: `Asistió a su evaluación (${session.schedule?.name ?? "clase"}), registrado en asistencia.`,
    });

    return member.id;
  });

  // Session counters, outside the transaction (same as recordAttendance).
  const totalAttendance = await prisma.attendance.count({ where: { classSessionId: session.id } });
  await prisma.classSession.update({
    where: { id: session.id },
    data: {
      adminCount: totalAttendance,
      discrepancy: session.coachConfirmation ? totalAttendance !== session.coachConfirmation.count : false,
    },
  });

  revalidatePath("/dashboard/asistencia");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/socios");
  revalidatePath("/dashboard");

  return { memberId, memberName: `${firstName} ${lastName}` };
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
  if (!isAttendanceWindowOpen()) {
    throw new Error("La ventana de registro está cerrada (cierra a las 9:30pm Ecuador). El siguiente día empieza a las 12:00 AM.");
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
      lead: { select: { id: true, stage: true, trialAttended: true } },
    },
  });

  const now = new Date();
  const expiredAlerts: string[] = [];

  const records = memberIds.map((memberId) => {
    const member = members.find((m) => m.id === memberId);
    const activeMembership = member?.memberships[0];
    // Someone inside their paid 2-week evaluation has no Membership row yet —
    // flagging them "Vencida" every single day is a false alarm, not a warning.
    const inTrial = member?.status === "TRIAL" || member?.status === "LEAD";
    const isExpired = !inTrial && (!activeMembership || activeMembership.endsAt < now);

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

  // Funnel write-back: registering a booked lead from the normal search counts as
  // their evaluation too, so the embudo doesn't depend on which box staff used.
  for (const member of members) {
    const lead = member.lead;
    if (!lead || lead.trialAttended === true) continue;
    if (lead.stage !== "SCHEDULED_TRIAL" && lead.stage !== "TRIAL_NO_SHOW") continue;
    await prisma
      .$transaction((tx) => markLeadAttended(tx, lead.id, { userId: user.id }))
      .catch((err) => console.error("[attendance] no se pudo marcar el lead", { leadId: lead.id, err }));
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

  // Build a "today in Ecuador" range for paidAt filtering (paidAt is a real timestamp).
  const todayEndUtc = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const [
    activeMembers,
    todayAttendance,
    expiredMemberships,
    upcomingRenewals,
    todayDiscrepancies,
    todayRevenueAgg,
  ] = await Promise.all([
    prisma.member.count({
      where: { ...sedeFilter, status: { in: ACTIVE_BASE } },
    }),
    prisma.attendance.count({
      where: {
        classSession: { ...sedeFilter, date: today },
      },
    }),
    // Exclude one-time daily passes from the membership "vencidas / por vencer" alerts
    prisma.membership.count({
      where: {
        member: sedeFilter,
        state: MembershipState.ACTIVE,
        endsAt: { lt: new Date() },
        plan: { billingCycle: { not: "ONE_TIME" } },
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
        plan: { billingCycle: { not: "ONE_TIME" } },
      },
    }),
    prisma.classSession.count({
      where: { ...sedeFilter, date: today, discrepancy: true },
    }),
    prisma.payment.aggregate({
      where: {
        ...sedeFilter,
        status: "SUCCEEDED",
        isPoolEntry: false,
        paidAt: { gte: today, lt: todayEndUtc },
      },
      _sum: { amountCents: true },
    }),
  ]);

  return {
    activeMembers,
    todayAttendance,
    expiredMemberships,
    upcomingRenewals,
    todayDiscrepancies,
    todayRevenueCents: todayRevenueAgg._sum.amountCents ?? 0,
  };
}
