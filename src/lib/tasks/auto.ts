// Tasks the app creates on its own, every morning (cron /api/cron/tasks-auto).
// They land in the front desk's pool of the person's sede, so the admins see
// them in "Recepción", the Resumen and the menu badge. Each one carries an
// `autoKey` naming its reason, so a rerun (or a retry of the cron) never
// creates the same task twice.
//
// Plain module on purpose: no permission checks, only the cron calls it.

import { prisma } from "@/lib/prisma";
import { isStaffFreeTraining } from "@/lib/staff-free-training";
import { ecuadorDateAt, ecuadorTimeOfDayMinutes, todayDateUtc } from "@/lib/timezone";
import { dueLabel, minutesToTime } from "@/lib/tasks/meta";
import type { LeadStage, Sede, StaffTaskType } from "@/generated/prisma/client";

/** How many "N días sin venir" calls per sede per day — a list nobody can finish is noise. */
const INACTIVE_CAP_PER_SEDE = 8;
const INACTIVE_MIN_DAYS = 7;
const INACTIVE_MAX_DAYS = 30;
const RENEWAL_WINDOW_DAYS = 3;

/** Stages where there's no evaluation left to receive. */
const EVAL_DONE_STAGES: LeadStage[] = ["TRIAL_ATTENDED", "CONVERTED", "LOST", "DISQUALIFIED"];

export type AutoTaskPlan = {
  autoKey: string;
  reason: "evaluación" | "renovación" | "cierre de trial" | "inasistencia";
  title: string;
  detail: string;
  type: StaffTaskType;
  priority: number;
  sede: Sede;
  leadId?: string;
  memberId?: string;
  dueMinutes: number | null;
};

const DAY = 86_400_000;
const name = (p: { firstName: string; lastName: string | null }) =>
  [p.firstName, p.lastName].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const shortDate = (d: Date) =>
  d.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "short" });

/** Socios who are staff: linked to a staff login, or on the free-training list. */
function isStaffMember(m: {
  firstName: string;
  lastName: string;
  user: { role: string } | null;
}): boolean {
  return (m.user !== null && m.user.role !== "MEMBER") || isStaffFreeTraining(m.firstName, m.lastName);
}

async function planEvaluations(today: Date): Promise<AutoTaskPlan[]> {
  const leads = await prisma.lead.findMany({
    where: {
      trialScheduledAt: { gte: ecuadorDateAt(today, 0, 0), lt: ecuadorDateAt(new Date(today.getTime() + DAY), 0, 0) },
      stage: { notIn: EVAL_DONE_STAGES },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      sede: true,
      trialScheduledAt: true,
      // A task someone already created for this lead today (like the ones
      // seeded by hand on 28 sep) covers it.
      staffTasks: {
        where: { dueDate: today, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } },
        select: { id: true },
      },
    },
  });
  return leads
    .filter((l) => l.staffTasks.length === 0)
    .map((l) => {
      const minutes = ecuadorTimeOfDayMinutes(l.trialScheduledAt!);
      return {
        autoKey: `eval:${l.id}:${ymd(today)}`,
        reason: "evaluación" as const,
        title: `Recibir a ${name(l)} — evaluación ${minutesToTime(minutes)}`,
        detail:
          "Tiene la evaluación hoy. Al llegar, dale la bienvenida y actualiza su etapa en Comunicación; " +
          "si no llega, escríbele para reagendar.",
        type: "TASK" as const,
        priority: 1,
        sede: l.sede,
        leadId: l.id,
        dueMinutes: minutes,
      };
    });
}

/**
 * The $9 two-week trial ending is a sale, not a renewal (see LeadStage
 * CONVERTED in the schema): the conversation is closing them on the monthly
 * plan, down the price ladder. Kept as data so the detail and any future UI
 * quote the same numbers.
 */
export const MONTHLY_PRICE_LADDER = { list: 60, close: 50, debitPrepay: 40 } as const;

type EndingMembership = {
  id: string;
  endsAt: Date;
  customPriceCents: number | null;
  plan: { name: string; priceCents: number };
  member: { id: string; firstName: string; lastName: string; sede: Sede };
};

const endDayLabel = (endsAt: Date, todayStr: string) =>
  dueLabel(endsAt.toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" }), null, todayStr).toLowerCase();

export function renewalPlan(ms: EndingMembership, todayStr: string): AutoTaskPlan {
  const price = (ms.customPriceCents ?? ms.plan.priceCents) / 100;
  return {
    autoKey: `renewal:${ms.id}`,
    reason: "renovación",
    title: `Cobrar renovación a ${name(ms.member)} — vence ${endDayLabel(ms.endsAt, todayStr)}`,
    detail: `${ms.plan.name} · $${price.toFixed(2)}. Recuérdale la renovación; si ya pagó, regístralo en su ficha.`,
    type: "COLLECTION",
    priority: 0,
    sede: ms.member.sede,
    memberId: ms.member.id,
    dueMinutes: null,
  };
}

export function trialClosePlan(ms: EndingMembership, classes: number, todayStr: string): AutoTaskPlan {
  const { list, close, debitPrepay } = MONTHLY_PRICE_LADDER;
  return {
    autoKey: `trialclose:${ms.id}`,
    reason: "cierre de trial",
    title: `Cierre de trial: ${name(ms.member)} — termina ${endDayLabel(ms.endsAt, todayStr)} (${classes} ${classes === 1 ? "clase" : "clases"})`,
    detail:
      `Termina su prueba de dos semanas (${ms.plan.name}). No es una renovación: es el cierre a la mensualidad. ` +
      "Siéntate con la persona, muéstrale su evaluación y lo que avanzó en estas semanas, y ofrécele la mensualidad: " +
      `lista $${list}, cierre $${close}, y hasta $${debitPrepay} con débito automático + prepago (trimestral, semestral o anual). ` +
      "Si ya pagó, regístralo en su ficha.",
    type: "TASK",
    priority: 1,
    sede: ms.member.sede,
    memberId: ms.member.id,
    dueMinutes: null,
  };
}

/**
 * Memberships ending in the next RENEWAL_WINDOW_DAYS: a collection task for
 * paid plans, a sales-close task for the $9 trial. ONE_TIME (day passes,
 * single services) gets neither.
 */
async function planEndings(today: Date, todayStr: string): Promise<AutoTaskPlan[]> {
  const until = ecuadorDateAt(new Date(today.getTime() + (RENEWAL_WINDOW_DAYS + 1) * DAY), 0, 0);
  const memberships = await prisma.membership.findMany({
    where: {
      state: "ACTIVE",
      endsAt: { gte: ecuadorDateAt(today, 0, 0), lt: until },
      plan: { billingCycle: { not: "ONE_TIME" } },
      member: { status: { not: "CHURNED" } },
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      customPriceCents: true,
      plan: { select: { name: true, priceCents: true, billingCycle: true } },
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          sede: true,
          user: { select: { role: true } },
          // Already renewed (or, for a trial, already closed): a later
          // membership is waiting (paid or not).
          memberships: {
            where: { state: { in: ["ACTIVE", "PENDING_PAYMENT"] } },
            select: { id: true, endsAt: true },
          },
        },
      },
    },
  });

  const ending = memberships
    .filter((ms) => !isStaffMember(ms.member))
    .filter((ms) => !ms.member.memberships.some((o) => o.id !== ms.id && o.endsAt > ms.endsAt));

  // Classes attended during each trial, for the title: how the two weeks went
  // is the first thing whoever closes needs to know.
  const trials = ending.filter((ms) => ms.plan.billingCycle === "TRIAL");
  const visits = trials.length
    ? await prisma.attendance.findMany({
        where: {
          memberId: { in: trials.map((ms) => ms.member.id) },
          recordedAt: { gte: new Date(Math.min(...trials.map((ms) => ms.startsAt.getTime()))) },
        },
        select: { memberId: true, recordedAt: true },
      })
    : [];

  return ending.map((ms) => {
    if (ms.plan.billingCycle !== "TRIAL") return renewalPlan(ms, todayStr);
    const classes = visits.filter(
      (v) => v.memberId === ms.member.id && v.recordedAt >= ms.startsAt && v.recordedAt < ms.endsAt,
    ).length;
    return trialClosePlan(ms, classes, todayStr);
  });
}

async function planInactive(now: Date): Promise<AutoTaskPlan[]> {
  const members = await prisma.member.findMany({
    where: {
      status: "ACTIVE",
      memberships: {
        some: { state: "ACTIVE", endsAt: { gte: now }, plan: { billingCycle: { not: "ONE_TIME" } } },
      },
      // One open "sin venir" call per person at a time.
      staffTasks: {
        none: { autoKey: { startsWith: "inactive:" }, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] } },
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      sede: true,
      user: { select: { role: true } },
      attendance: { orderBy: { recordedAt: "desc" }, take: 1, select: { recordedAt: true } },
    },
  });

  const plans = members
    .filter((m) => !isStaffMember(m) && m.attendance.length > 0)
    .map((m) => {
      const last = m.attendance[0].recordedAt;
      return { m, last, days: Math.floor((now.getTime() - last.getTime()) / DAY) };
    })
    .filter((x) => x.days >= INACTIVE_MIN_DAYS && x.days <= INACTIVE_MAX_DAYS)
    // Longest gone first: they're the closest to not coming back.
    .sort((a, b) => b.days - a.days);

  const perSede = new Map<Sede, number>();
  const out: AutoTaskPlan[] = [];
  for (const { m, last, days } of plans) {
    const n = perSede.get(m.sede) ?? 0;
    if (n >= INACTIVE_CAP_PER_SEDE) continue;
    perSede.set(m.sede, n + 1);
    out.push({
      // Keyed to the last visit: if they come back and lapse again, that's a new call.
      autoKey: `inactive:${m.id}:${last.toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" })}`,
      reason: "inasistencia",
      title: `Llamar a ${name(m)}: ${days} días sin venir`,
      detail: `Última asistencia: ${shortDate(last)}. Pregúntale cómo va y si le sirve otro horario.`,
      type: "CALL",
      priority: 0,
      sede: m.sede,
      memberId: m.id,
      dueMinutes: null,
    });
  }
  return out;
}

export type AutoTasksSummary = {
  planned: number;
  created: number;
  alreadyThere: number;
  byReason: Record<string, number>;
  plans: AutoTaskPlan[];
};

/**
 * Plans today's automatic tasks and (unless `dryRun`) creates the ones that
 * don't exist yet. Returns what it planned, for the cron log.
 */
export async function generateAutoTasks(opts: { dryRun?: boolean } = {}): Promise<AutoTasksSummary> {
  const now = new Date();
  const today = todayDateUtc();
  const todayStr = ymd(today);

  const endings = await planEndings(today, todayStr);
  // The renewal / close conversation already reaches whoever is both about to
  // expire and absent.
  const renewing = new Set(endings.map((r) => r.memberId));
  const plans = [
    ...(await planEvaluations(today)),
    ...endings,
    ...(await planInactive(now)).filter((p) => !renewing.has(p.memberId)),
  ];

  const existing = new Set(
    (
      await prisma.staffTask.findMany({
        where: { autoKey: { in: plans.map((p) => p.autoKey) } },
        select: { autoKey: true },
      })
    ).map((t) => t.autoKey),
  );
  const fresh = plans.filter((p) => !existing.has(p.autoKey));

  const byReason: Record<string, number> = {};
  for (const p of fresh) byReason[p.reason] = (byReason[p.reason] ?? 0) + 1;

  let created = 0;
  if (!opts.dryRun) {
    for (const p of fresh) {
      try {
        await prisma.$transaction(async (tx) => {
          const t = await tx.staffTask.create({
            data: {
              autoKey: p.autoKey,
              title: p.title,
              detail: p.detail,
              type: p.type,
              priority: p.priority,
              sede: p.sede,
              leadId: p.leadId ?? null,
              memberId: p.memberId ?? null,
              dueDate: today,
              dueMinutes: p.dueMinutes,
            },
          });
          await tx.staffTaskEntry.create({
            data: { taskId: t.id, kind: "EVENT", body: `La creó automáticamente (${p.reason}).` },
          });
        });
        created++;
      } catch (err) {
        // A concurrent run won the unique autoKey — that's fine.
        const code = (err as { code?: string })?.code;
        if (code !== "P2002") throw err;
      }
    }
  }

  return { planned: plans.length, created, alreadyThere: existing.size, byReason, plans: fresh };
}
