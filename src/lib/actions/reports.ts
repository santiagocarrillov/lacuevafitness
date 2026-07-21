"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Sede, ExpenseCategory, MemberStatus } from "@/generated/prisma/client";

// ── Helpers ─────────────────────────────────────────────────────────

function monthBounds(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);
  return { start, end };
}

function rangeBounds(from: string, to: string) {
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T23:59:59");
  return { start, end };
}

function prevMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

// ── Attendance report: UNIQUE attending members vs active base ───────
// Distinct members who attended (not total visits), engagement vs active
// members, and payment status of the active base.
export async function getAttendanceReport(sede: Sede | undefined, from: string, to: string) {
  const { start, end } = rangeBounds(from, to);
  const now = new Date();
  const activeStatus = { in: [MemberStatus.ACTIVE, MemberStatus.TRIAL] };
  const memberSede = sede ? { sede } : {};
  const sessionInRange = { date: { gte: start, lte: end }, ...(sede ? { sede } : {}) };

  const [
    distinctOverall,
    totalVisits,
    distinctFC,
    distinctXT,
    activeTotal,
    activeAttended,
    coverageMembers,
    sinMembresia,
  ] = await Promise.all([
    // Unique members who attended (respecting sede filter on the session)
    prisma.attendance.groupBy({ by: ["memberId"], where: { classSession: sessionInRange } }),
    prisma.attendance.count({ where: { classSession: sessionInRange } }),
    // Per-sede unique (only needed when no sede filter is applied)
    sede
      ? Promise.resolve([] as { memberId: string }[])
      : prisma.attendance.groupBy({
          by: ["memberId"],
          where: { classSession: { date: { gte: start, lte: end }, sede: "FITNESS_CENTER" } },
        }),
    sede
      ? Promise.resolve([] as { memberId: string }[])
      : prisma.attendance.groupBy({
          by: ["memberId"],
          where: { classSession: { date: { gte: start, lte: end }, sede: "XTREME" } },
        }),
    // Active member base
    prisma.member.count({ where: { status: activeStatus, ...memberSede } }),
    // Active members who attended at least once in the period (anywhere)
    prisma.member.count({
      where: {
        status: activeStatus,
        ...memberSede,
        attendance: { some: { classSession: { date: { gte: start, lte: end } } } },
      },
    }),
    // Al día (estricto): fetch each active member's CURRENT valid (non-daily)
    // membership + its SUCCEEDED payments, to check full payment coverage in JS.
    prisma.member.findMany({
      where: { status: activeStatus, ...memberSede },
      select: {
        memberships: {
          where: { plan: { billingCycle: { not: "ONE_TIME" } }, state: "ACTIVE", endsAt: { gte: now } },
          orderBy: { endsAt: "desc" },
          take: 1,
          select: {
            customPriceCents: true,
            plan: { select: { priceCents: true } },
            payments: { where: { status: "SUCCEEDED" }, select: { amountCents: true } },
          },
        },
      },
    }),
    // Sin membresía: active member with no (non-daily) membership at all
    prisma.member.count({
      where: {
        status: activeStatus,
        ...memberSede,
        memberships: { none: { plan: { billingCycle: { not: "ONE_TIME" } } } },
      },
    }),
  ]);

  // Al día = current membership fully covered by SUCCEEDED payments (PENDING /
  // unverified funds do NOT count). Everyone else with an active status but no
  // fully-paid current membership falls into "debe".
  let alDia = 0;
  for (const m of coverageMembers) {
    const cur = m.memberships[0];
    if (!cur) continue;
    const expected = cur.customPriceCents ?? cur.plan.priceCents;
    const paid = cur.payments.reduce((s, p) => s + p.amountCents, 0);
    if (paid >= expected) alDia++;
  }

  const debe = Math.max(0, activeTotal - alDia - sinMembresia);

  return {
    from,
    to,
    attendance: {
      uniqueMembers: distinctOverall.length,
      totalVisits,
      perSede: sede ? null : { FITNESS_CENTER: distinctFC.length, XTREME: distinctXT.length },
    },
    active: {
      total: activeTotal,
      attended: activeAttended,
      notAttended: Math.max(0, activeTotal - activeAttended),
      engagementPct: activeTotal > 0 ? Math.round((activeAttended / activeTotal) * 100) : 0,
    },
    payment: { alDia, debe, sinMembresia },
  };
}

// ── Management KPIs (Tablero de Control Gestión) ────────────────────

export async function getManagementKPIs(
  sede: Sede | undefined,
  year: number,
  month: number,
) {
  const { start, end } = monthBounds(year, month);
  const sedeFilter = sede ? { sede } : {};
  const memberSedeFilter = sede ? { member: { sede } } : {};

  // Get or create target
  const targets = sede
    ? await prisma.monthlyTarget.findUnique({ where: { sede_year_month: { sede, year, month } } })
    : null;

  // Current metrics
  const [
    activeMembers,
    sales,               // new memberships this month
    leads,               // new leads this month
    leadsScheduled,      // scheduled trials
    trialsAttended,
    renewals,            // memberships that renewed
    churns,              // members who left
    revenueAgg,
    totalAttendance,
    priorMonthMembers,
    planBreakdown,
  ] = await Promise.all([
    // Socios activos totales
    prisma.member.count({
      where: { ...sedeFilter, status: { in: ["ACTIVE", "TRIAL"] } },
    }),
    // Ventas del mes = nuevas membresías activas (excluye pases diarios)
    prisma.membership.count({
      where: {
        ...memberSedeFilter,
        createdAt: { gte: start, lte: end },
        state: { in: ["ACTIVE", "PENDING_PAYMENT"] },
        plan: { billingCycle: { not: "ONE_TIME" } },
      },
    }),
    // Leads nuevos
    prisma.lead.count({
      where: { ...sedeFilter, createdAt: { gte: start, lte: end } },
    }),
    // Leads agendados
    prisma.lead.count({
      where: {
        ...sedeFilter,
        createdAt: { gte: start, lte: end },
        stage: { in: ["SCHEDULED_TRIAL", "TRIAL_ATTENDED", "TRIAL_NO_SHOW", "NEGOTIATING", "CONVERTED"] },
      },
    }),
    // Clases de prueba que asistieron
    prisma.lead.count({
      where: {
        ...sedeFilter,
        createdAt: { gte: start, lte: end },
        stage: { in: ["TRIAL_ATTENDED", "NEGOTIATING", "CONVERTED"] },
      },
    }),
    // Renovaciones (excluye pases diarios)
    prisma.membership.count({
      where: {
        ...memberSedeFilter,
        createdAt: { gte: start, lte: end },
        state: "ACTIVE",
        member: sede ? { sede, status: "ACTIVE" } : { status: "ACTIVE" },
        plan: { billingCycle: { not: "ONE_TIME" } },
      },
    }),
    // Bajas del mes
    prisma.member.count({
      where: { ...sedeFilter, status: "CHURNED", churnedAt: { gte: start, lte: end } },
    }),
    // Facturación del mes (sum of payments, exclude pool entries)
    prisma.payment.aggregate({
      where: {
        ...sedeFilter,
        status: "SUCCEEDED",
        isPoolEntry: false,
        memberId: { not: null },
        paidAt: { gte: start, lte: end },
      },
      _sum: { amountCents: true },
    }),
    // Asistencia total del mes
    prisma.attendance.count({
      where: {
        classSession: { ...sedeFilter, date: { gte: start, lte: end } },
      },
    }),
    // Socios activos mes anterior (para rotación)
    prisma.member.count({
      where: {
        ...sedeFilter,
        status: { in: ["ACTIVE", "TRIAL", "CHURNED"] },
        joinedAt: { lt: start },
      },
    }),
    // Distribución de ventas por tipo de plan (excluye pases diarios)
    prisma.membership.groupBy({
      by: ["planId"],
      where: {
        ...memberSedeFilter,
        createdAt: { gte: start, lte: end },
        plan: { billingCycle: { not: "ONE_TIME" } },
      },
      _count: true,
    }),
  ]);

  // ── Ventas nuevas vs renovaciones ──────────────────────────────────
  // A membership created in the period is a "venta nueva" if it's the member's
  // FIRST non-daily membership ever; otherwise it's a "renovación" (a
  // continuation — e.g. a month-to-month renewal). ventasNuevas + renovaciones
  // = total non-daily memberships created in the period.
  const membershipsInRange = await prisma.membership.findMany({
    where: {
      ...memberSedeFilter,
      createdAt: { gte: start, lte: end },
      state: { in: ["ACTIVE", "PENDING_PAYMENT"] },
      plan: { billingCycle: { not: "ONE_TIME" } },
    },
    select: { memberId: true },
  });
  const rangeMemberIds = [...new Set(membershipsInRange.map((m) => m.memberId))];
  const earliestPerMember = rangeMemberIds.length
    ? await prisma.membership.groupBy({
        by: ["memberId"],
        where: {
          memberId: { in: rangeMemberIds },
          plan: { billingCycle: { not: "ONE_TIME" } },
        },
        _min: { createdAt: true },
      })
    : [];
  // Members whose first-ever non-daily membership falls inside the period.
  const newMemberIds = new Set(
    earliestPerMember
      .filter((e) => e._min.createdAt && e._min.createdAt >= start && e._min.createdAt <= end)
      .map((e) => e.memberId),
  );
  const ventasNuevas = newMemberIds.size;
  const renovaciones = Math.max(0, membershipsInRange.length - ventasNuevas);

  // Get plan names
  const planIds = planBreakdown.map((p) => p.planId);
  const plans = await prisma.membershipPlan.findMany({
    where: { id: { in: planIds } },
  });
  const planMap = new Map(plans.map((p) => [p.id, p]));

  // Ticket promedio = revenue / active members
  const revenueCents = revenueAgg._sum.amountCents ?? 0;
  const ticketPromedio = activeMembers > 0 ? revenueCents / activeMembers / 100 : 0;

  // % Rotación = bajas / socios activos mes anterior
  const rotacionPct = priorMonthMembers > 0 ? (churns / priorMonthMembers) * 100 : 0;

  // Índice Renovación = renovados / (activos + bajas)
  const toRenew = activeMembers + churns;
  const indiceRenovacion = toRenew > 0 ? (renewals / toRenew) * 100 : 0;

  // Efectividad de ventas = ventas / visitantes
  const efectividadVentas = leads > 0 ? (sales / leads) * 100 : 0;

  // Índice de Agendamiento = agendados / leads
  const indiceAgendamiento = leads > 0 ? (leadsScheduled / leads) * 100 : 0;

  // Índice de Invitación = asistieron / agendados
  const indiceInvitacion = leadsScheduled > 0 ? (trialsAttended / leadsScheduled) * 100 : 0;

  // % Meta
  const pctMetaFacturacion = targets?.revenueTargetCents
    ? (revenueCents / targets.revenueTargetCents) * 100
    : 0;
  const pctMetaVentas = targets?.salesTarget
    ? (sales / targets.salesTarget) * 100
    : 0;
  const pctMetaAveriguadores = targets?.leadsTarget
    ? (leads / targets.leadsTarget) * 100
    : 0;
  const pctMetaAsistencia = targets?.attendanceTarget
    ? (totalAttendance / targets.attendanceTarget) * 100
    : 0;

  return {
    activeMembers,
    sales,
    ventasNuevas,
    renovaciones,
    leads,
    leadsScheduled,
    trialsAttended,
    renewals,
    churns,
    revenueCents,
    totalAttendance,
    ticketPromedio,
    rotacionPct,
    indiceRenovacion,
    efectividadVentas,
    indiceAgendamiento,
    indiceInvitacion,
    pctMetaFacturacion,
    pctMetaVentas,
    pctMetaAveriguadores,
    pctMetaAsistencia,
    targets,
    planBreakdown: planBreakdown.map((p) => ({
      planId: p.planId,
      planName: planMap.get(p.planId)?.name ?? p.planId,
      count: p._count,
      billingCycle: planMap.get(p.planId)?.billingCycle,
    })),
  };
}

// ── Monthly financial table (Contable) ──────────────────────────────

export async function getMonthlyFinancials(
  sede: Sede | undefined,
  monthsBack = 12,
) {
  const now = new Date();
  const months: { year: number; month: number }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const sedeFilter = sede ? { sede } : {};
  const memberSedeFilter = sede ? { member: { sede } } : {};

  const rows = await Promise.all(
    months.map(async ({ year, month }) => {
      const { start, end } = monthBounds(year, month);

      const [
        revenueAgg,
        activeMembers,
        sales,
        leads,
        leadsScheduled,
        churns,
        renewals,
        expensesAgg,
        payrollAgg,
      ] = await Promise.all([
        prisma.payment.aggregate({
          where: {
            ...sedeFilter,
            status: "SUCCEEDED",
            isPoolEntry: false,
            memberId: { not: null },
            paidAt: { gte: start, lte: end },
          },
          _sum: { amountCents: true },
        }),
        prisma.member.count({
          where: {
            ...sedeFilter,
            joinedAt: { lte: end },
            OR: [
              { churnedAt: null },
              { churnedAt: { gt: end } },
            ],
          },
        }),
        // Ventas del mes (excluye pases diarios)
        prisma.membership.count({
          where: {
            ...memberSedeFilter,
            createdAt: { gte: start, lte: end },
            plan: { billingCycle: { not: "ONE_TIME" } },
          },
        }),
        prisma.lead.count({
          where: { ...sedeFilter, createdAt: { gte: start, lte: end } },
        }),
        prisma.lead.count({
          where: {
            ...sedeFilter,
            createdAt: { gte: start, lte: end },
            stage: { in: ["SCHEDULED_TRIAL", "TRIAL_ATTENDED", "TRIAL_NO_SHOW", "NEGOTIATING", "CONVERTED"] },
          },
        }),
        prisma.member.count({
          where: { ...sedeFilter, churnedAt: { gte: start, lte: end } },
        }),
        // Activas mensuales (excluye pases diarios)
        prisma.membership.count({
          where: {
            ...memberSedeFilter,
            createdAt: { gte: start, lte: end },
            state: "ACTIVE",
            plan: { billingCycle: { not: "ONE_TIME" } },
          },
        }),
        prisma.expense.aggregate({
          where: { ...sedeFilter, date: { gte: start, lte: end } },
          _sum: { amountCents: true },
        }),
        prisma.expense.aggregate({
          where: { ...sedeFilter, category: "PAYROLL", date: { gte: start, lte: end } },
          _sum: { amountCents: true },
        }),
      ]);

      const revenue = (revenueAgg._sum.amountCents ?? 0) / 100;
      const expenses = (expensesAgg._sum.amountCents ?? 0) / 100;
      const payroll = (payrollAgg._sum.amountCents ?? 0) / 100;
      const ticketPromedio = activeMembers > 0 ? revenue / activeMembers : 0;
      const utility = revenue - expenses;
      const profitability = revenue > 0 ? (utility / revenue) * 100 : 0;
      const payrollPct = revenue > 0 ? (payroll / revenue) * 100 : 0;

      return {
        year,
        month,
        label: new Date(year, month - 1, 1).toLocaleDateString("es-EC", { month: "short", year: "2-digit" }),
        revenue,
        activeMembers,
        ticketPromedio,
        sales,
        leads,
        leadsScheduled,
        churns,
        renewals,
        expenses,
        payroll,
        utility,
        profitability,
        payrollPct,
      };
    }),
  );

  return rows;
}

// ── Sales breakdown by source (Comercial) ───────────────────────────

export async function getCommercialReport(
  sede: Sede | undefined,
  from: string,
  to: string,
) {
  const { start, end } = rangeBounds(from, to);
  const sedeFilter = sede ? { sede } : {};

  const [sourceBreakdown, stageBreakdown, dailyLeads] = await Promise.all([
    prisma.lead.groupBy({
      by: ["source"],
      where: { ...sedeFilter, createdAt: { gte: start, lte: end } },
      _count: true,
    }),
    prisma.lead.groupBy({
      by: ["stage"],
      where: { ...sedeFilter, createdAt: { gte: start, lte: end } },
      _count: true,
    }),
    prisma.lead.findMany({
      where: { ...sedeFilter, createdAt: { gte: start, lte: end } },
      select: { createdAt: true, source: true, stage: true },
    }),
  ]);

  // Conversion rate by source
  const sourceStats = new Map<string, { total: number; converted: number }>();
  for (const lead of dailyLeads) {
    const s = lead.source;
    const curr = sourceStats.get(s) ?? { total: 0, converted: 0 };
    curr.total++;
    if (lead.stage === "CONVERTED") curr.converted++;
    sourceStats.set(s, curr);
  }

  // Daily leads for line chart
  const dailyMap = new Map<string, number>();
  for (const lead of dailyLeads) {
    const day = lead.createdAt.toISOString().split("T")[0];
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }
  const daily = Array.from(dailyMap.entries())
    .sort()
    .map(([date, count]) => ({ date, count }));

  return {
    sources: sourceBreakdown.map((s) => ({
      source: s.source,
      count: s._count,
      converted: sourceStats.get(s.source)?.converted ?? 0,
      conversionRate: sourceStats.get(s.source)?.total
        ? Math.round(((sourceStats.get(s.source)?.converted ?? 0) / (sourceStats.get(s.source)?.total ?? 1)) * 100)
        : 0,
    })),
    stages: stageBreakdown.map((s) => ({ stage: s.stage, count: s._count })),
    daily,
  };
}

// ── Upsert monthly target ───────────────────────────────────────────

export async function upsertMonthlyTarget(data: {
  sede: Sede;
  year: number;
  month: number;
  revenueTargetCents?: number;
  salesTarget?: number;
  visitorsTarget?: number;
  leadsTarget?: number;
  attendanceTarget?: number;
  workingDays?: number;
  projectedICVPct?: number;
}) {
  const target = await prisma.monthlyTarget.upsert({
    where: { sede_year_month: { sede: data.sede, year: data.year, month: data.month } },
    update: {
      revenueTargetCents: data.revenueTargetCents,
      salesTarget: data.salesTarget,
      visitorsTarget: data.visitorsTarget,
      leadsTarget: data.leadsTarget,
      attendanceTarget: data.attendanceTarget,
      workingDays: data.workingDays,
      projectedICVPct: data.projectedICVPct,
    },
    create: {
      sede: data.sede,
      year: data.year,
      month: data.month,
      revenueTargetCents: data.revenueTargetCents ?? 0,
      salesTarget: data.salesTarget ?? 0,
      visitorsTarget: data.visitorsTarget ?? 0,
      leadsTarget: data.leadsTarget ?? 0,
      attendanceTarget: data.attendanceTarget ?? 0,
      workingDays: data.workingDays ?? 21,
      projectedICVPct: data.projectedICVPct ?? 50,
    },
  });

  revalidatePath("/dashboard/reportes");
  return target;
}

// ── Expense CRUD ────────────────────────────────────────────────────

export async function createExpense(data: {
  sede?: Sede;
  category: ExpenseCategory;
  description: string;
  amountCents: number;
  date: string;
  recurring?: boolean;
  notes?: string;
}) {
  const expense = await prisma.expense.create({
    data: {
      sede: data.sede,
      category: data.category,
      description: data.description,
      amountCents: data.amountCents,
      date: new Date(data.date),
      recurring: data.recurring ?? false,
      notes: data.notes,
    },
  });

  revalidatePath("/dashboard/reportes");
  return expense;
}

export async function getExpenses(sede: Sede | undefined, year: number, month: number) {
  const { start, end } = monthBounds(year, month);
  return prisma.expense.findMany({
    where: {
      ...(sede ? { sede } : {}),
      date: { gte: start, lte: end },
    },
    orderBy: { date: "desc" },
  });
}

export async function getExpensesByRange(sede: Sede | undefined, from: string, to: string) {
  const { start, end } = rangeBounds(from, to);
  return prisma.expense.findMany({
    where: {
      ...(sede ? { sede } : {}),
      date: { gte: start, lte: end },
    },
    orderBy: { date: "desc" },
  });
}

export async function deleteExpense(id: string) {
  await prisma.expense.delete({ where: { id } });
  revalidatePath("/dashboard/reportes");
}

// ── Commercial pipeline (Comercial) ────────────────────────────────

export async function getCommercialPipeline(
  sede: Sede | undefined,
  from: string,
  to: string,
) {
  const { start, end } = rangeBounds(from, to);
  const sedeFilter = sede ? { sede } : {};

  const [totalLeads, evaluaciones, convertidos] = await Promise.all([
    prisma.lead.count({
      where: { ...sedeFilter, createdAt: { gte: start, lte: end } },
    }),
    prisma.lead.count({
      where: {
        ...sedeFilter,
        createdAt: { gte: start, lte: end },
        stage: { in: ["TRIAL_ATTENDED", "NEGOTIATING", "CONVERTED"] },
      },
    }),
    prisma.lead.count({
      where: {
        ...sedeFilter,
        createdAt: { gte: start, lte: end },
        stage: "CONVERTED",
      },
    }),
  ]);

  const leadsToEvaluacionesPct = totalLeads > 0 ? Math.round((evaluaciones / totalLeads) * 100) : 0;
  const leadsToConvertidosPct = totalLeads > 0 ? Math.round((convertidos / totalLeads) * 100) : 0;
  const evaluacionesToConvertidosPct = evaluaciones > 0 ? Math.round((convertidos / evaluaciones) * 100) : 0;

  return {
    totalLeads,
    evaluaciones,
    convertidos,
    leadsToEvaluacionesPct,
    leadsToConvertidosPct,
    evaluacionesToConvertidosPct,
  };
}

// ── Detail queries for drill-down ───────────────────────────────────

export async function getRevenueDetail(
  sede: Sede | undefined,
  from: string,
  to: string,
) {
  const { start, end } = rangeBounds(from, to);
  const sedeFilter = sede ? { sede } : {};

  return prisma.payment.findMany({
    where: {
      ...sedeFilter,
      status: "SUCCEEDED",
      isPoolEntry: false,
      memberId: { not: null },
      paidAt: { gte: start, lte: end },
    },
    include: {
      member: true,
      membership: {
        include: { plan: true },
      },
    },
    orderBy: { paidAt: "desc" },
  });
}

export async function getLeadsDetail(
  sede: Sede | undefined,
  from: string,
  to: string,
  stage?: string[],
) {
  const { start, end } = rangeBounds(from, to);
  const sedeFilter = sede ? { sede } : {};

  return prisma.lead.findMany({
    where: {
      ...sedeFilter,
      createdAt: { gte: start, lte: end },
      ...(stage ? { stage: { in: stage as any[] } } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      source: true,
      stage: true,
      createdAt: true,
      convertedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSalesDetail(
  sede: Sede | undefined,
  from: string,
  to: string,
) {
  const { start, end } = rangeBounds(from, to);
  const memberSedeFilter = sede ? { member: { sede } } : {};

  return prisma.membership.findMany({
    where: {
      ...memberSedeFilter,
      createdAt: { gte: start, lte: end },
      plan: { billingCycle: { not: "ONE_TIME" } },
    },
    include: {
      member: true,
      plan: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

// ── Drill-down: socios activos / vencidos / por vencer / bajas ────────

export async function getActiveMembersDetail(sede: Sede | undefined) {
  const sedeFilter = sede ? { sede } : {};
  return prisma.member.findMany({
    where: { ...sedeFilter, status: { in: ["ACTIVE", "TRIAL"] } },
    include: {
      memberships: {
        // Exclude one-time daily passes — those don't represent an active member plan
        where: { state: "ACTIVE", plan: { billingCycle: { not: "ONE_TIME" } } },
        orderBy: { endsAt: "desc" },
        take: 1,
        include: { plan: true },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function getExpiredMembershipsDetail(sede: Sede | undefined) {
  const memberSedeFilter = sede ? { member: { sede } } : {};
  return prisma.membership.findMany({
    where: {
      ...memberSedeFilter,
      state: "ACTIVE",
      endsAt: { lt: new Date() },
      plan: { billingCycle: { not: "ONE_TIME" } },
    },
    include: { member: true, plan: true },
    orderBy: { endsAt: "desc" },
  });
}

export async function getUpcomingRenewalsDetail(sede: Sede | undefined, days = 7) {
  const memberSedeFilter = sede ? { member: { sede } } : {};
  const now = new Date();
  return prisma.membership.findMany({
    where: {
      ...memberSedeFilter,
      state: "ACTIVE",
      endsAt: { gte: now, lte: new Date(now.getTime() + days * 86400000) },
      plan: { billingCycle: { not: "ONE_TIME" } },
    },
    include: { member: true, plan: true },
    orderBy: { endsAt: "asc" },
  });
}

export async function getChurnsDetail(
  sede: Sede | undefined,
  from: string,
  to: string,
) {
  const { start, end } = rangeBounds(from, to);
  const sedeFilter = sede ? { sede } : {};
  return prisma.member.findMany({
    where: {
      ...sedeFilter,
      status: "CHURNED",
      churnedAt: { gte: start, lte: end },
    },
    orderBy: { churnedAt: "desc" },
  });
}

export async function getRenewalsDetail(
  sede: Sede | undefined,
  from: string,
  to: string,
) {
  const { start, end } = rangeBounds(from, to);
  return prisma.membership.findMany({
    where: {
      member: sede ? { sede, status: "ACTIVE" } : { status: "ACTIVE" },
      createdAt: { gte: start, lte: end },
      state: "ACTIVE",
      plan: { billingCycle: { not: "ONE_TIME" } },
    },
    include: { member: true, plan: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAttendanceDetail(
  sede: Sede | undefined,
  from: string,
  to: string,
) {
  const { start, end } = rangeBounds(from, to);
  const sedeFilter = sede ? { sede } : {};
  return prisma.attendance.findMany({
    where: {
      classSession: { ...sedeFilter, date: { gte: start, lte: end } },
    },
    include: {
      member: { select: { id: true, firstName: true, lastName: true, sede: true } },
      classSession: { include: { schedule: true } },
    },
    orderBy: { recordedAt: "desc" },
    take: 500,
  });
}

export async function getDiscrepanciesDetail(sede: Sede | undefined, from: string, to: string) {
  const { start, end } = rangeBounds(from, to);
  const sedeFilter = sede ? { sede } : {};
  return prisma.classSession.findMany({
    where: {
      ...sedeFilter,
      date: { gte: start, lte: end },
      discrepancy: true,
    },
    include: { schedule: true },
    orderBy: { date: "desc" },
  });
}
