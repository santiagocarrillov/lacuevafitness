// Numbers behind the third row of the Resumen: the commercial funnel and the
// SRXFIT/nutrition pulse. Server-only reads (the page is a server component);
// kept out of "use server" files so nothing here becomes a callable action.
import { prisma } from "@/lib/prisma";
import { OFFICIAL_ENTRY_WHERE } from "@/lib/entry-source";
import { isStaffFreeTraining } from "@/lib/staff-free-training";
import { ecuadorDateAt, ecuadorParts, todayDateUtc } from "@/lib/timezone";
import type { Sede } from "@/generated/prisma/client";

const SCHEDULED_OR_LATER = ["SCHEDULED_TRIAL", "TRIAL_ATTENDED", "TRIAL_NO_SHOW", "NEGOTIATING", "CONVERTED"] as const;
const ATTENDED_OR_LATER = ["TRIAL_ATTENDED", "NEGOTIATING", "CONVERTED"] as const;

/** 00:00 Ecuador on the 1st of the current month. */
function monthStart(): Date {
  const { year, month } = ecuadorParts();
  return ecuadorDateAt(new Date(Date.UTC(year, month - 1, 1)), 0, 0);
}

export type FunnelPanel = {
  leads: number;
  scheduled: number;
  evaluated: number;
  converted: number;
  newToday: number;
  evaluationsToday: number;
};

/**
 * Leads created this month and how far each got — same cut as the Comercial
 * report (a lead counts in every stage it has passed). CONVERTED means paying
 * the monthly fee; the $9 trial is an evaluation, not a sale.
 */
export async function getFunnelPanel(sede: Sede | null): Promise<FunnelPanel> {
  const sedeFilter = sede ? { sede } : {};
  const created = { ...sedeFilter, createdAt: { gte: monthStart() } };
  const todayStart = ecuadorDateAt(todayDateUtc(), 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);

  const [leads, scheduled, evaluated, converted, newToday, evaluationsToday] = await Promise.all([
    prisma.lead.count({ where: created }),
    prisma.lead.count({ where: { ...created, stage: { in: [...SCHEDULED_OR_LATER] } } }),
    prisma.lead.count({ where: { ...created, stage: { in: [...ATTENDED_OR_LATER] } } }),
    prisma.lead.count({ where: { ...created, stage: "CONVERTED" } }),
    prisma.lead.count({ where: { ...sedeFilter, createdAt: { gte: todayStart, lt: todayEnd } } }),
    prisma.lead.count({
      where: {
        ...sedeFilter,
        trialScheduledAt: { gte: todayStart, lt: todayEnd },
        stage: { notIn: ["LOST", "DISQUALIFIED"] },
      },
    }),
  ]);
  return { leads, scheduled, evaluated, converted, newToday, evaluationsToday };
}

export type SrxfitPanel = {
  prs: number;
  prsToValidate: number;
  nutritionSeen: number;
  plansSent: number;
  withApp: number;
  activeSocios: number;
};

/** This month's training + nutrition activity, and how many socios have the app. */
export async function getSrxfitPanel(sede: Sede | null): Promise<SrxfitPanel> {
  const since = monthStart();
  const memberSede = sede ? { member: { sede } } : {};

  const [prs, prsToValidate, seen, plans, socios] = await Promise.all([
    prisma.testResult.count({
      where: { ...memberSede, recordedAt: { gte: since }, ...OFFICIAL_ENTRY_WHERE },
    }),
    prisma.testResult.count({ where: { ...memberSede, source: "MEMBER", verifiedAt: null } }),
    prisma.nutritionAppointment.findMany({
      where: {
        ...(sede ? { sede } : {}),
        status: "ATTENDED",
        startsAt: { gte: since },
      },
      distinct: ["memberId"],
      select: { memberId: true },
    }),
    prisma.mealPlan.findMany({
      where: { ...memberSede, active: true, visibleToMember: true, publishedAt: { gte: since } },
      distinct: ["memberId"],
      select: { memberId: true },
    }),
    // Same population as Nutrición → App: active/trial socios, staff left out.
    prisma.member.findMany({
      where: {
        status: { in: ["ACTIVE", "TRIAL"] },
        ...(sede ? { OR: [{ sede }, { secondarySede: sede }] } : {}),
        NOT: { user: { role: { not: "MEMBER" } } },
      },
      select: { firstName: true, lastName: true, userId: true },
    }),
  ]);

  const clients = socios.filter((m) => !isStaffFreeTraining(m.firstName, m.lastName));
  return {
    prs,
    prsToValidate,
    nutritionSeen: seen.length,
    plansSent: plans.length,
    withApp: clients.filter((m) => m.userId).length,
    activeSocios: clients.length,
  };
}
