"use server";

import { prisma } from "@/lib/prisma";
import { Sede } from "@/generated/prisma/client";

// ─────────────────────────────────────────────────────────────
// Member analytics — computed stats per member
// ─────────────────────────────────────────────────────────────

export type ChurnRisk = "LOW" | "MEDIUM" | "HIGH" | "CHURNED";

export type MemberAnalytics = {
  ltvCents: number;
  avgTicketCents: number;
  totalPayments: number;
  totalAttendance: number;
  attendanceLast7Days: number;
  attendanceLast30Days: number;
  attendanceLast90Days: number;
  weeklyFrequency: number;
  weeklyFrequencyRecent: number; // last 4 weeks
  daysSinceLastAttendance: number | null;
  lastAttendanceAt: Date | null;
  preferredHourBucket: "morning" | "afternoon" | "evening" | null;
  preferredHourLabel: string;
  topSchedules: { name: string; count: number; startTime: string }[];
  churnRisk: ChurnRisk;
  churnReasons: string[];
  membershipStatus: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "FROZEN" | "CANCELED" | "NONE";
  daysUntilRenewal: number | null;
};

export async function getMemberAnalytics(memberId: string): Promise<MemberAnalytics> {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const d28 = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  const [
    member,
    paymentsAgg,
    paymentCount,
    totalAttendance,
    last7,
    last30,
    last90,
    last28Sum,
    lastAttendance,
    attendanceByHour,
    attendanceBySchedule,
  ] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      include: {
        memberships: {
          orderBy: { endsAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.payment.aggregate({
      where: { memberId, status: "SUCCEEDED" },
      _sum: { amountCents: true },
    }),
    prisma.payment.count({
      where: { memberId, status: "SUCCEEDED" },
    }),
    prisma.attendance.count({ where: { memberId } }),
    prisma.attendance.count({
      where: { memberId, recordedAt: { gte: d7 } },
    }),
    prisma.attendance.count({
      where: { memberId, recordedAt: { gte: d30 } },
    }),
    prisma.attendance.count({
      where: { memberId, recordedAt: { gte: d90 } },
    }),
    prisma.attendance.count({
      where: { memberId, recordedAt: { gte: d28 } },
    }),
    prisma.attendance.findFirst({
      where: { memberId },
      orderBy: { recordedAt: "desc" },
      select: { recordedAt: true },
    }),
    // Attendance grouped by class hour bucket
    prisma.$queryRaw<{ hour: string; cnt: bigint }[]>`
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM cs."startAt") < 12 THEN 'morning'
          WHEN EXTRACT(HOUR FROM cs."startAt") < 17 THEN 'afternoon'
          ELSE 'evening'
        END as hour,
        COUNT(*) as cnt
      FROM "Attendance" a
      JOIN "ClassSession" cs ON cs.id = a."classSessionId"
      WHERE a."memberId" = ${memberId}
      GROUP BY 1
      ORDER BY 2 DESC
    `,
    // Top 3 schedules attended
    prisma.$queryRaw<{ name: string; startTime: string; cnt: bigint }[]>`
      SELECT s.name, s."startTime", COUNT(*) as cnt
      FROM "Attendance" a
      JOIN "ClassSession" cs ON cs.id = a."classSessionId"
      JOIN "ClassSchedule" s ON s.id = cs."scheduleId"
      WHERE a."memberId" = ${memberId}
      GROUP BY s.name, s."startTime"
      ORDER BY cnt DESC
      LIMIT 3
    `,
  ]);

  if (!member) throw new Error("Member not found");

  const ltvCents = paymentsAgg._sum.amountCents ?? 0;
  const avgTicketCents = paymentCount > 0 ? Math.round(ltvCents / paymentCount) : 0;

  // Weekly frequency (lifetime)
  const weeksSinceJoin = Math.max(
    1,
    (now.getTime() - member.joinedAt.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );
  const weeklyFrequency = totalAttendance / weeksSinceJoin;
  const weeklyFrequencyRecent = last28Sum / 4;

  const lastAttendanceAt = lastAttendance?.recordedAt ?? null;
  const daysSinceLastAttendance = lastAttendanceAt
    ? Math.floor((now.getTime() - lastAttendanceAt.getTime()) / (24 * 60 * 60 * 1000))
    : null;

  // Preferred time of day
  const top = attendanceByHour[0];
  const preferredHourBucket = (top?.hour as any) ?? null;
  const preferredHourLabel =
    preferredHourBucket === "morning" ? "Mañana"
    : preferredHourBucket === "afternoon" ? "Tarde"
    : preferredHourBucket === "evening" ? "Noche"
    : "—";

  const topSchedules = attendanceBySchedule.map((r) => ({
    name: r.name,
    startTime: r.startTime,
    count: Number(r.cnt),
  }));

  // ── Membership status ────────────────────────────────────────────
  const activeMembership = member.memberships[0];
  let membershipStatus: MemberAnalytics["membershipStatus"] = "NONE";
  let daysUntilRenewal: number | null = null;

  if (member.status === "PAUSED") {
    membershipStatus = "FROZEN";
  } else if (member.status === "CHURNED") {
    membershipStatus = "CANCELED";
  } else if (activeMembership) {
    const endDate = new Date(activeMembership.endsAt);
    const daysLeft = Math.floor((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (activeMembership.state === "CANCELED") {
      membershipStatus = "CANCELED";
    } else if (daysLeft < 0) {
      membershipStatus = "EXPIRED";
    } else if (daysLeft <= 7) {
      membershipStatus = "EXPIRING_SOON";
      daysUntilRenewal = daysLeft;
    } else {
      membershipStatus = "ACTIVE";
      daysUntilRenewal = daysLeft;
    }
  }

  // ── Churn risk score ──────────────────────────────────────────────
  const churnReasons: string[] = [];
  let churnRisk: ChurnRisk = "LOW";

  if (member.status === "CHURNED") {
    churnRisk = "CHURNED";
  } else {
    if (daysSinceLastAttendance === null) {
      churnReasons.push("Nunca ha asistido");
      churnRisk = "HIGH";
    } else if (daysSinceLastAttendance > 30) {
      churnReasons.push(`No asiste hace ${daysSinceLastAttendance} días`);
      churnRisk = "HIGH";
    } else if (daysSinceLastAttendance > 14) {
      churnReasons.push(`No asiste hace ${daysSinceLastAttendance} días`);
      churnRisk = churnRisk === "LOW" ? "MEDIUM" : churnRisk;
    } else if (daysSinceLastAttendance > 7) {
      churnReasons.push(`Hace ${daysSinceLastAttendance} días sin venir`);
      churnRisk = churnRisk === "LOW" ? "MEDIUM" : churnRisk;
    }

    if (membershipStatus === "EXPIRED") {
      churnReasons.push("Membresía vencida sin renovar");
      churnRisk = "HIGH";
    } else if (membershipStatus === "EXPIRING_SOON") {
      churnReasons.push(`Vence en ${daysUntilRenewal} días`);
      if (churnRisk === "LOW") churnRisk = "MEDIUM";
    } else if (membershipStatus === "NONE") {
      churnReasons.push("Sin membresía activa");
      churnRisk = "HIGH";
    }

    // Frequency drop: recent < lifetime average × 0.5
    if (weeklyFrequency > 0.5 && weeklyFrequencyRecent < weeklyFrequency * 0.5) {
      churnReasons.push(
        `Frecuencia bajó (${weeklyFrequencyRecent.toFixed(1)}x/sem vs ${weeklyFrequency.toFixed(1)}x histórico)`,
      );
      if (churnRisk === "LOW") churnRisk = "MEDIUM";
    }
  }

  return {
    ltvCents,
    avgTicketCents,
    totalPayments: paymentCount,
    totalAttendance,
    attendanceLast7Days: last7,
    attendanceLast30Days: last30,
    attendanceLast90Days: last90,
    weeklyFrequency,
    weeklyFrequencyRecent,
    daysSinceLastAttendance,
    lastAttendanceAt,
    preferredHourBucket,
    preferredHourLabel,
    topSchedules,
    churnRisk,
    churnReasons,
    membershipStatus,
    daysUntilRenewal,
  };
}

// ─────────────────────────────────────────────────────────────
// Smart segments
// ─────────────────────────────────────────────────────────────

export type SegmentKey =
  | "low_attendance"        // 2x or less per week recently
  | "morning_members"       // train mostly in the morning
  | "afternoon_members"
  | "evening_members"
  | "expiring_soon"         // membership expires in next 7 days
  | "expired_no_renewal"    // expired in last 30 days, no new membership
  | "at_risk"               // haven't come in 7-14 days
  | "high_risk"             // haven't come in 14+ days
  | "ghost"                 // no attendance in 30+ days
  | "champions";            // 4x+ per week, 90+ days

export async function getSegmentMembers(
  segment: SegmentKey,
  sede?: Sede,
) {
  const now = new Date();
  const sedeFilter = sede ? { sede } : {};

  switch (segment) {
    case "low_attendance": {
      // Members with active membership but ≤ 2 attendances in last 28 days
      const result = await prisma.$queryRaw<any[]>`
        SELECT m.id, m."firstName", m."lastName", m.sede, m.status,
          COUNT(a.id) as recent_attendance
        FROM "Member" m
        LEFT JOIN "Attendance" a ON a."memberId" = m.id
          AND a."recordedAt" >= ${new Date(now.getTime() - 28 * 86400000)}
        WHERE m.status IN ('ACTIVE', 'TRIAL')
          ${sede ? prisma.$queryRaw`AND m.sede = ${sede}::"Sede"` : prisma.$queryRaw``}
        GROUP BY m.id
        HAVING COUNT(a.id) <= 2
        ORDER BY recent_attendance ASC, m."lastName"
        LIMIT 200
      `;
      return result;
    }

    case "morning_members":
    case "afternoon_members":
    case "evening_members": {
      const bucket = segment.replace("_members", "");
      const lowerHour = bucket === "morning" ? 0 : bucket === "afternoon" ? 12 : 17;
      const upperHour = bucket === "morning" ? 12 : bucket === "afternoon" ? 17 : 24;
      const result = await prisma.$queryRaw<any[]>`
        SELECT m.id, m."firstName", m."lastName", m.sede, m.status,
          COUNT(*) as count_in_bucket
        FROM "Member" m
        JOIN "Attendance" a ON a."memberId" = m.id
        JOIN "ClassSession" cs ON cs.id = a."classSessionId"
        WHERE m.status IN ('ACTIVE', 'TRIAL')
          AND EXTRACT(HOUR FROM cs."startAt") >= ${lowerHour}
          AND EXTRACT(HOUR FROM cs."startAt") < ${upperHour}
          AND a."recordedAt" >= ${new Date(now.getTime() - 60 * 86400000)}
          ${sede ? prisma.$queryRaw`AND m.sede = ${sede}::"Sede"` : prisma.$queryRaw``}
        GROUP BY m.id
        HAVING COUNT(*) >= 5
        ORDER BY count_in_bucket DESC, m."lastName"
        LIMIT 200
      `;
      return result;
    }

    case "expiring_soon": {
      const in7 = new Date(now.getTime() + 7 * 86400000);
      return prisma.member.findMany({
        where: {
          ...sedeFilter,
          status: { in: ["ACTIVE", "TRIAL"] },
          memberships: {
            some: {
              state: "ACTIVE",
              endsAt: { gte: now, lte: in7 },
            },
          },
        },
        select: { id: true, firstName: true, lastName: true, sede: true, status: true,
          memberships: { where: { state: "ACTIVE" }, take: 1, select: { endsAt: true, plan: { select: { name: true } } } },
        },
        orderBy: { lastName: "asc" },
        take: 200,
      });
    }

    case "expired_no_renewal": {
      const past30 = new Date(now.getTime() - 30 * 86400000);
      return prisma.member.findMany({
        where: {
          ...sedeFilter,
          status: { in: ["ACTIVE", "TRIAL"] },
          memberships: {
            none: {
              state: "ACTIVE",
              endsAt: { gte: now },
            },
          },
        },
        select: { id: true, firstName: true, lastName: true, sede: true, status: true,
          memberships: { orderBy: { endsAt: "desc" }, take: 1, select: { endsAt: true, plan: { select: { name: true } } } },
        },
        orderBy: { lastName: "asc" },
        take: 200,
      });
    }

    case "at_risk":
    case "high_risk":
    case "ghost": {
      const minDays = segment === "at_risk" ? 7 : segment === "high_risk" ? 14 : 30;
      const maxDays = segment === "at_risk" ? 14 : segment === "high_risk" ? 30 : 365;
      const minDate = new Date(now.getTime() - maxDays * 86400000);
      const maxDate = new Date(now.getTime() - minDays * 86400000);

      const result = await prisma.$queryRaw<any[]>`
        SELECT m.id, m."firstName", m."lastName", m.sede, m.status,
          MAX(a."recordedAt") as last_attendance
        FROM "Member" m
        LEFT JOIN "Attendance" a ON a."memberId" = m.id
        WHERE m.status IN ('ACTIVE', 'TRIAL')
          ${sede ? prisma.$queryRaw`AND m.sede = ${sede}::"Sede"` : prisma.$queryRaw``}
        GROUP BY m.id
        HAVING MAX(a."recordedAt") IS NOT NULL
          AND MAX(a."recordedAt") <= ${maxDate}
          AND MAX(a."recordedAt") >= ${minDate}
        ORDER BY last_attendance ASC
        LIMIT 200
      `;
      return result;
    }

    case "champions": {
      const past90 = new Date(now.getTime() - 90 * 86400000);
      const result = await prisma.$queryRaw<any[]>`
        SELECT m.id, m."firstName", m."lastName", m.sede, m.status,
          COUNT(a.id) as total_attendance
        FROM "Member" m
        JOIN "Attendance" a ON a."memberId" = m.id
        WHERE m.status IN ('ACTIVE', 'TRIAL')
          AND a."recordedAt" >= ${past90}
          AND m."joinedAt" <= ${past90}
          ${sede ? prisma.$queryRaw`AND m.sede = ${sede}::"Sede"` : prisma.$queryRaw``}
        GROUP BY m.id
        HAVING COUNT(a.id) >= 48
        ORDER BY total_attendance DESC
        LIMIT 200
      `;
      return result;
    }
  }
}

export async function getSegmentCounts(sede?: Sede) {
  const segments: SegmentKey[] = [
    "low_attendance",
    "morning_members",
    "afternoon_members",
    "evening_members",
    "expiring_soon",
    "expired_no_renewal",
    "at_risk",
    "high_risk",
    "ghost",
    "champions",
  ];

  const counts: Record<string, number> = {};
  for (const seg of segments) {
    const result = await getSegmentMembers(seg, sede);
    counts[seg] = result.length;
  }
  return counts;
}
