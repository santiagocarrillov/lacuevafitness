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
import { blockOf, evaluationGaps } from "@/lib/srxfit/group-stats";
import { notifyStaff } from "@/lib/push/notify-staff";

/** How many "N días sin venir" calls per sede per day — a list nobody can finish is noise. */
const INACTIVE_CAP_PER_SEDE = 8;
const INACTIVE_MIN_DAYS = 7;
const INACTIVE_MAX_DAYS = 30;
const RENEWAL_WINDOW_DAYS = 3;
/** "Evaluar a X" per sede per day: the full list lives in SRXFIT › Evaluaciones. */
const EVALGAP_CAP_PER_SEDE = 10;

/** Stages where there's no evaluation left to receive. */
const EVAL_DONE_STAGES: LeadStage[] = ["TRIAL_ATTENDED", "CONVERTED", "LOST", "DISQUALIFIED"];

export type AutoTaskPlan = {
  autoKey: string;
  reason: "evaluación" | "renovación" | "inasistencia" | "evaluación SRXFIT";
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

async function planRenewals(today: Date, todayStr: string): Promise<AutoTaskPlan[]> {
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
      endsAt: true,
      customPriceCents: true,
      plan: { select: { name: true, priceCents: true } },
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          sede: true,
          user: { select: { role: true } },
          // Already renewed: a later membership is waiting (paid or not).
          memberships: {
            where: { state: { in: ["ACTIVE", "PENDING_PAYMENT"] } },
            select: { id: true, endsAt: true },
          },
        },
      },
    },
  });

  return memberships
    .filter((ms) => !isStaffMember(ms.member))
    .filter((ms) => !ms.member.memberships.some((o) => o.id !== ms.id && o.endsAt > ms.endsAt))
    .map((ms) => {
      const endDay = ms.endsAt.toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
      const price = (ms.customPriceCents ?? ms.plan.priceCents) / 100;
      return {
        autoKey: `renewal:${ms.id}`,
        reason: "renovación" as const,
        title: `Cobrar renovación a ${name(ms.member)} — vence ${dueLabel(endDay, null, todayStr).toLowerCase()}`,
        detail:
          `${ms.plan.name} · $${price.toFixed(2)}. Recuérdale la renovación; ` +
          "si ya pagó, regístralo en su ficha.",
        type: "COLLECTION" as const,
        priority: 0,
        sede: ms.member.sede,
        memberId: ms.member.id,
        dueMinutes: null,
      };
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

/**
 * Socios who pay and train but have no official SRXFIT data in two cycles:
 * the sede's admin must test and measure them. One task per socio per block.
 */
async function planEvalGaps(now: Date): Promise<AutoTaskPlan[]> {
  const gaps = await evaluationGaps(now);
  const block = blockOf(now);
  const perSede = new Map<Sede, number>();
  const out: AutoTaskPlan[] = [];
  for (const g of gaps) {
    const n = perSede.get(g.sede) ?? 0;
    if (n >= EVALGAP_CAP_PER_SEDE) continue;
    perSede.set(g.sede, n + 1);
    out.push({
      autoKey: `evalgap:${g.memberId}:${block}`,
      reason: "evaluación SRXFIT",
      title: `Evaluar a ${g.name}: sin datos SRXFIT en dos ciclos`,
      detail:
        `${g.lastDataAt ? `Último dato: ${shortDate(g.lastDataAt)}.` : "Nunca se le registraron tests ni mediciones."} ` +
        `Viene (${g.visits30} visitas en 30 días) pero no ve su progreso en la app. Hazle los tests y la composición corporal ` +
        `(SRXFIT › Evaluaciones). Si no se pudo, anótalo aquí para mandarle el mensaje.`,
      type: "TASK",
      priority: 1,
      sede: g.sede,
      memberId: g.memberId,
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

  const renewals = await planRenewals(today, todayStr);
  // The renewal call already reaches whoever is both about to expire and absent.
  const renewing = new Set(renewals.map((r) => r.memberId));
  const plans = [
    ...(await planEvaluations(today)),
    ...renewals,
    ...(await planInactive(now)).filter((p) => !renewing.has(p.memberId)),
    ...(await planEvalGaps(now)),
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

  // Immediate heads-up to the sede's admins when new evaluation gaps appear.
  if (!opts.dryRun) {
    const gapsBySede = new Map<Sede, number>();
    for (const p of fresh) if (p.reason === "evaluación SRXFIT") gapsBySede.set(p.sede, (gapsBySede.get(p.sede) ?? 0) + 1);
    await Promise.all(
      [...gapsBySede].map(([sede, n]) =>
        notifyStaff({
          roles: ["ADMIN"],
          sede,
          payload: {
            title: "Socios sin evaluación SRXFIT",
            body: `${n} ${n === 1 ? "socio paga y asiste" : "socios pagan y asisten"} sin datos en dos ciclos. Evalúalos esta semana.`,
            url: "/dashboard/tareas",
          },
        }).catch(() => undefined),
      ),
    );
  }

  return { planned: plans.length, created, alreadyThere: existing.size, byReason, plans: fresh };
}
