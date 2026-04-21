"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Sede, ExpenseCategory } from "@/generated/prisma/client";

// ── Helpers ─────────────────────────────────────────────────────────

function monthBounds(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);
  return { start, end };
}

function prevMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
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
    // Ventas del mes = nuevas membresías activas
    prisma.membership.count({
      where: {
        ...memberSedeFilter,
        createdAt: { gte: start, lte: end },
        state: { in: ["ACTIVE", "PENDING_PAYMENT"] },
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
    // Renovaciones
    prisma.membership.count({
      where: {
        ...memberSedeFilter,
        createdAt: { gte: start, lte: end },
        state: "ACTIVE",
        member: sede ? { sede, status: "ACTIVE" } : { status: "ACTIVE" },
      },
    }),
    // Bajas del mes
    prisma.member.count({
      where: { ...sedeFilter, status: "CHURNED", churnedAt: { gte: start, lte: end } },
    }),
    // Facturación del mes (sum of payments)
    prisma.payment.aggregate({
      where: {
        ...sedeFilter,
        status: "SUCCEEDED",
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
    // Distribución de ventas por tipo de plan
    prisma.membership.groupBy({
      by: ["planId"],
      where: {
        ...memberSedeFilter,
        createdAt: { gte: start, lte: end },
      },
      _count: true,
    }),
  ]);

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
          where: { ...sedeFilter, status: "SUCCEEDED", paidAt: { gte: start, lte: end } },
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
        prisma.membership.count({
          where: { ...memberSedeFilter, createdAt: { gte: start, lte: end } },
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
        prisma.membership.count({
          where: {
            ...memberSedeFilter,
            createdAt: { gte: start, lte: end },
            state: "ACTIVE",
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
  year: number,
  month: number,
) {
  const { start, end } = monthBounds(year, month);
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

export async function deleteExpense(id: string) {
  await prisma.expense.delete({ where: { id } });
  revalidatePath("/dashboard/reportes");
}
