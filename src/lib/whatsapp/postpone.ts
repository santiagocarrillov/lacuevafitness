/**
 * "Escríbeme después del 5 de noviembre": the lead asks us to come back later.
 *
 * Until 19 oct 2026 the no-reply cadence kept going anyway — Marizol said she had
 * another gym paid until 5 nov and still got the +3 h, ~22 h and day-3 nudges
 * (canceled by hand). Now the agent returns the date (`contactarDesde`), the
 * cadence stops, and ONE thing is left for that day: a WHATSAPP task in the
 * pool of the lead's sede, unassigned like the automatic tasks, so a person
 * writes when the lead said. A person and not a template, because by then the
 * 24 h window is closed and a warm "como quedamos" beats a canned message.
 *
 * The pure parts (date check, task plan) are tested in scripts/test-posponer.ts.
 */

import { prisma } from "@/lib/prisma";
import { ecuadorParts } from "@/lib/timezone";
import type { Sede, StaffTaskType } from "@/generated/prisma/client";

const DAY = 86_400_000;
/** Further than this and it's a polite no; we still come back, at this horizon. */
export const POSTPONE_MAX_DAYS = 180;

const AUTO_KEY_PREFIX = "lead-posponer:";
const OPEN = ["TODO", "IN_PROGRESS", "WAITING"] as const;

/**
 * The agent's "YYYY-MM-DD" → that Ecuador day as a UTC-midnight Date (the shape
 * of StaffTask.dueDate), or null when it isn't a usable date: malformed, not a
 * real day (30 feb), or today/past — "escríbeme hoy en la tarde" is a reply, not
 * a postponement. Dates beyond POSTPONE_MAX_DAYS are pulled in to that horizon.
 */
export function parsePostponeDate(value: string | null | undefined, now: Date = new Date()): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;

  const { year, month, day } = ecuadorParts(now);
  const today = Date.UTC(year, month - 1, day);
  const days = Math.round((date.getTime() - today) / DAY);
  if (days < 1) return null;
  return days > POSTPONE_MAX_DAYS ? new Date(today + POSTPONE_MAX_DAYS * DAY) : date;
}

export type PostponeLead = { id: string; firstName: string; lastName: string | null; sede: Sede };

export type PostponeTaskPlan = {
  autoKey: string;
  title: string;
  detail: string;
  type: StaffTaskType;
  priority: number;
  sede: Sede;
  leadId: string;
  dueDate: Date;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** "5 nov" for a UTC-midnight day (read in UTC so it never slips a day). */
const shortDay = (d: Date) => d.toLocaleDateString("es-EC", { timeZone: "UTC", day: "numeric", month: "short" });

/** What the task says. Pure, so the test can read it. */
export function postponeTaskPlan(lead: PostponeLead, date: Date, said: string | null): PostponeTaskPlan {
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const snippet = said?.replace(/\s+/g, " ").trim().slice(0, 240);
  return {
    // One per lead and date: a retry never duplicates it; a new date is a new task.
    autoKey: `${AUTO_KEY_PREFIX}${lead.id}:${ymd(date)}`,
    title: `Escribir a ${fullName} por WhatsApp: pidió que le escribamos el ${shortDay(date)}`,
    detail:
      (snippet ? `Le dijo al agente: «${snippet}». ` : "") +
      "El agente paró los seguimientos automáticos hasta hoy. Escríbele retomando lo que quedaron, desde su ficha o " +
      "Comunicación › WhatsApp; si pasaron más de 24 h desde su último mensaje, WhatsApp solo deja mandar una plantilla aprobada.",
    type: "WHATSAPP",
    priority: 1,
    sede: lead.sede,
    leadId: lead.id,
    dueDate: date,
  };
}

/**
 * Leave the task for that day. Any other open postponement of the same lead is
 * canceled (they changed the date). Never throws: the reply already went out.
 */
export async function createPostponeTask(lead: PostponeLead, date: Date, said: string | null): Promise<void> {
  const plan = postponeTaskPlan(lead, date, said);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.staffTask.updateMany({
        where: { leadId: lead.id, autoKey: { startsWith: AUTO_KEY_PREFIX, not: plan.autoKey }, status: { in: [...OPEN] } },
        data: { status: "CANCELED", outcome: `Reemplazada: ahora pidió que le escribamos el ${shortDay(date)}.` },
      });
      const existing = await tx.staffTask.findUnique({ where: { autoKey: plan.autoKey }, select: { id: true } });
      if (existing) return;
      const t = await tx.staffTask.create({ data: plan });
      await tx.staffTaskEntry.create({
        data: { taskId: t.id, kind: "EVENT", body: "La creó el agente de WhatsApp: el lead pidió que le escribamos más adelante." },
      });
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return; // a concurrent run created it
    console.error("[whatsapp-agent] no se pudo crear la tarea de posponer", { leadId: lead.id, err });
  }
}

/** The lead booked after all: the pending "escribirle el X" no longer applies. */
export async function closePostponeTasks(leadId: string, outcome: string): Promise<void> {
  try {
    await prisma.staffTask.updateMany({
      where: { leadId, autoKey: { startsWith: AUTO_KEY_PREFIX }, status: { in: [...OPEN] } },
      data: { status: "DONE", doneAt: new Date(), outcome },
    });
  } catch (err) {
    console.error("[whatsapp-agent] no se pudo cerrar la tarea de posponer", { leadId, err });
  }
}
