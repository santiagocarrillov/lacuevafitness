// Automatic WhatsApp notices to socios (server, no auth — the cron and the
// OWNER screen call it). Each kind has its rule, its approved template and a
// switch: off = test mode (we only list who would get it). A notice goes out
// once per `key` (MemberNotice.key is unique), never twice the same day.
// Rules agreed with Santiago, 5 oct 2026 (target: 3 visits a week for everyone).

import { prisma } from "@/lib/prisma";
import type { Sede } from "@/generated/prisma/client";
import { isStaffFreeTraining } from "@/lib/staff-free-training";
import { ecuadorDateString } from "@/lib/timezone";
import { addDays, ecuadorTimeString } from "@/lib/nutrition/appointments";
import { weekdayOf } from "@/lib/nutrition/slots";
import { toSchedule } from "@/lib/nutrition/to-schedule";
import { ensureInvite } from "@/lib/nutrition/booking-core";
import { sendTemplate } from "@/lib/whatsapp/client";
import { phoneKey } from "@/lib/whatsapp/contact";
import { renderTemplate, templateName } from "@/lib/whatsapp/templates";
import { approvedTemplateNames } from "@/lib/whatsapp/graph";

export type NoticeKind = "AUSENCIA" | "FRECUENCIA" | "CUMPLEANOS" | "NUTRI_TRIAL" | "NUTRI_MEDICION" | "NUTRI_RECORDATORIO" | "TESTS";

export const NOTICE_KINDS: { kind: NoticeKind; template: string; label: string; rule: string; automatic: boolean }[] = [
  { kind: "AUSENCIA", template: "socio_ausencia", label: "Días sin venir", rule: "Socio que paga y venía seguido, al tercer día sin venir (sin contar domingos). Una vez por ausencia.", automatic: true },
  { kind: "FRECUENCIA", template: "socio_frecuencia_baja", label: "Menos de 3 veces por semana", rule: "En las últimas 2 semanas vino entre 3 y 5 veces (1,5 a 2,5 por semana). Máximo una vez al mes; no si ya recibió el de días sin venir esa semana.", automatic: true },
  { kind: "CUMPLEANOS", template: "socio_cumpleanos", label: "Cumpleaños", rule: "Socios activos y en evaluación, el día de su cumpleaños.", automatic: true },
  { kind: "NUTRI_TRIAL", template: "nutricion_evaluacion_trial", label: "Cita nutricional del trial", rule: "Quien pagó los $9 y aún no tiene cita, con su fecha límite y el enlace para agendar.", automatic: true },
  { kind: "NUTRI_MEDICION", template: "socio_medicion_pendiente", label: "Medición pendiente", rule: "Socio que paga sin medición en 18 semanas, con el enlace para agendar. Una vez por ciclo.", automatic: true },
  { kind: "NUTRI_RECORDATORIO", template: "nutricion_recordatorio_cita", label: "Recordatorio de cita nutricional", rule: "El día anterior a la cita (además de la notificación de la app).", automatic: true },
  { kind: "TESTS", template: "socio_tests_pendientes", label: "Faltan tus tests SRXFIT", rule: "Solo a mano: el admin lo manda desde SRXFIT › Evaluaciones cuando intentó evaluarlo y no pudo.", automatic: false },
];

/** Safety net: at most this many automatic messages per kind per run. */
const PER_KIND_CAP = 25;
const DAY = 86_400_000;

export type NoticeCandidate = {
  kind: NoticeKind;
  key: string;
  memberId: string;
  name: string;
  sede: Sede;
  phone: string | null;
  variables: string[];
  /** Booking-link reason: the code is created only when actually sending. */
  invite?: { reason: "TRIAL" | "MEASUREMENT"; deadline: string | null };
  preview: string;
};

const notStaff = { OR: [{ userId: null }, { user: { role: "MEMBER" as const } }] };
const payingNow = (now: Date) => ({ some: { state: "ACTIVE" as const, endsAt: { gte: now }, plan: { billingCycle: { notIn: ["TRIAL" as const, "ONE_TIME" as const] } } } });
const longDate = (ymd: string) =>
  new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${ymd}T12:00:00Z`)).replace(",", "");
const SEDE_NAME: Record<Sede, string> = { FITNESS_CENTER: "La Cueva Fitness Center", XTREME: "La Cueva Xtreme" };

/** Days between two Ecuador calendar days, not counting Sundays (the gym is closed). */
export function trainingDaysBetween(from: string, to: string): number {
  let n = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (weekdayOf(d) !== 7) n++;
  return n;
}

function candidate(kind: NoticeKind, key: string, m: { id: string; firstName: string; lastName: string | null; sede: Sede; phone: string | null }, variables: string[], invite?: NoticeCandidate["invite"]): NoticeCandidate {
  const template = NOTICE_KINDS.find((k) => k.kind === kind)!.template;
  return {
    kind, key, memberId: m.id, name: `${m.firstName} ${m.lastName ?? ""}`.trim(), sede: m.sede, phone: m.phone, variables, invite,
    preview: renderTemplate({ name: template, language: "es", variables }),
  };
}

/** Who gets each automatic notice today. Pure reads; nothing is sent. */
export async function planNotices(now = new Date()): Promise<NoticeCandidate[]> {
  const today = ecuadorDateString(now);
  const out: NoticeCandidate[] = [];

  // ── Attendance: AUSENCIA and FRECUENCIA ──
  const payers = await prisma.member.findMany({
    where: { status: "ACTIVE", ...notStaff, memberships: payingNow(now), joinedAt: { lte: new Date(now.getTime() - 21 * DAY) } },
    select: {
      id: true, firstName: true, lastName: true, sede: true, phone: true,
      attendance: { where: { recordedAt: { gte: new Date(now.getTime() - 45 * DAY) } }, orderBy: { recordedAt: "desc" }, select: { recordedAt: true } },
      notices: { where: { createdAt: { gte: new Date(now.getTime() - 31 * DAY) }, status: "SENT" }, select: { kind: true, createdAt: true } },
    },
  });
  for (const m of payers) {
    if (isStaffFreeTraining(m.firstName, m.lastName)) continue;
    const first = templateName(m.firstName, m.lastName);
    const visits = m.attendance.map((a) => a.recordedAt);
    if (visits.length) {
      const lastDay = ecuadorDateString(visits[0]);
      const gone = trainingDaysBetween(lastDay, today);
      const regular = visits.filter((v) => v.getTime() >= visits[0].getTime() - 30 * DAY).length >= 6;
      if (gone === 3 && regular) out.push(candidate("AUSENCIA", `AUSENCIA:${m.id}:${lastDay}`, m, [first, "3"]));
    }
    const last14 = visits.filter((v) => v.getTime() >= now.getTime() - 14 * DAY).length;
    const recentlyNudged = m.notices.some((n) => n.kind === "FRECUENCIA" || (n.kind === "AUSENCIA" && n.createdAt.getTime() >= now.getTime() - 7 * DAY));
    // 3–5 visits in two weeks = 1,5–2,5 a week ("veces" stays plural); fewer is an absence.
    if (last14 >= 3 && last14 <= 5 && !recentlyNudged) {
      const perWeek = Math.round((last14 / 2) * 2) / 2; // 0.5 steps
      out.push(candidate("FRECUENCIA", `FRECUENCIA:${m.id}:${today.slice(0, 7)}`, m, [first, String(perWeek).replace(".", ",")]));
    }
  }

  // ── Birthdays (active and trial) ──
  const mmdd = today.slice(5);
  const bdays = await prisma.member.findMany({
    where: { status: { in: ["ACTIVE", "TRIAL"] }, ...notStaff, dateOfBirth: { not: null } },
    select: { id: true, firstName: true, lastName: true, sede: true, phone: true, dateOfBirth: true },
  });
  const year = Number(today.slice(0, 4));
  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  for (const m of bdays) {
    const b = m.dateOfBirth!.toISOString().slice(5, 10);
    const match = b === mmdd || (b === "02-29" && !isLeap(year) && mmdd === "02-28");
    if (match && !isStaffFreeTraining(m.firstName, m.lastName)) {
      out.push(candidate("CUMPLEANOS", `CUMPLEANOS:${m.id}:${year}`, m, [templateName(m.firstName, m.lastName)]));
    }
  }

  // ── Nutrition: trials and measurements to schedule ──
  const pending = await toSchedule({ now });
  const members = new Map(
    (await prisma.member.findMany({ where: { id: { in: pending.map((p) => p.memberId) } }, select: { id: true, firstName: true, lastName: true, sede: true, phone: true } })).map((m) => [m.id, m]),
  );
  for (const p of pending) {
    const m = members.get(p.memberId);
    if (!m || p.daysLeft < 0) continue; // a missed deadline is the nutritionist's call, not a robot's
    const first = templateName(m.firstName, m.lastName);
    if (p.reason === "TRIAL") out.push(candidate("NUTRI_TRIAL", `NUTRI_TRIAL:${m.id}:${p.deadline}`, m, [first, longDate(p.deadline)], { reason: "TRIAL", deadline: p.deadline }));
    else {
      const weeks = Math.max(18, Math.floor((Date.parse(today) - Date.parse(addDays(p.deadline, -140))) / (7 * DAY)));
      out.push(candidate("NUTRI_MEDICION", `NUTRI_MEDICION:${m.id}:${p.deadline}`, m, [first, String(weeks)], { reason: "MEASUREMENT", deadline: null }));
    }
  }

  // ── Nutrition: tomorrow's appointments ──
  const tomorrow = addDays(today, 1);
  const appts = await prisma.nutritionAppointment.findMany({
    where: { status: "SCHEDULED", startsAt: { gte: new Date(`${tomorrow}T05:00:00.000Z`), lt: new Date(`${addDays(tomorrow, 1)}T05:00:00.000Z`) } },
    include: { member: { select: { id: true, firstName: true, lastName: true, sede: true, phone: true } } },
  });
  for (const a of appts) {
    out.push(candidate("NUTRI_RECORDATORIO", `NUTRI_RECORDATORIO:${a.id}:${a.startsAt.toISOString()}`, a.member, [
      templateName(a.member.firstName, a.member.lastName), `mañana ${longDate(tomorrow)}`, ecuadorTimeString(a.startsAt), SEDE_NAME[a.sede],
    ]));
  }

  // Drop what was already sent (or attempted) under the same key.
  const done = new Set((await prisma.memberNotice.findMany({ where: { key: { in: out.map((c) => c.key) } }, select: { key: true } })).map((n) => n.key));
  return out.filter((c) => !done.has(c.key));
}

export type SendOutcome = { key: string; status: "SENT" | "FAILED" | "SKIPPED"; detail?: string };

/** Sends one notice: conversation + template + message in the thread + MemberNotice row. */
export async function sendNotice(c: NoticeCandidate, createdById: string | null = null): Promise<SendOutcome> {
  const template = NOTICE_KINDS.find((k) => k.kind === c.kind)!.template;
  const key = phoneKey(c.phone);
  if (!key) return { key: c.key, status: "SKIPPED", detail: "Sin celular válido" };
  const digits = c.phone!.replace(/\D/g, "");
  const externalId = digits.startsWith("593") ? digits : `593${key}`;

  // Claim the key first, so two runs never send it twice.
  try {
    await prisma.memberNotice.create({ data: { memberId: c.memberId, kind: c.kind, key: c.key, template, status: "FAILED", error: "Enviando…", createdById } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { key: c.key, status: "SKIPPED", detail: "Ya enviado" };
    throw e;
  }
  try {
    let button: string | undefined;
    if (c.invite) {
      const inv = await ensureInvite({ memberId: c.memberId, reason: c.invite.reason, deadline: c.invite.deadline, kind: c.invite.reason === "TRIAL" ? "INITIAL" : "FOLLOW_UP", createdById });
      button = inv.code;
    }
    const sent = await sendTemplate(externalId, template, "es", c.variables, [], button);
    const conv =
      (await prisma.conversation.findUnique({ where: { channel_externalId: { channel: "WHATSAPP", externalId } }, select: { id: true } })) ??
      (await prisma.conversation.findUnique({ where: { memberId: c.memberId }, select: { id: true } })) ??
      (await prisma.conversation.create({ data: { memberId: c.memberId, sede: c.sede, channel: "WHATSAPP", externalId, botPaused: true }, select: { id: true } }));
    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conv.id, direction: "OUTBOUND", channel: "WHATSAPP", externalId: sent.messageId,
          body: c.preview, sentByUserId: createdById, llmGenerated: false, sendStatus: "SENT", sendAttemptedAt: new Date(),
        },
      }),
      // A socio's reply goes to the staff, not to the sales agent.
      prisma.conversation.update({ where: { id: conv.id }, data: { botPaused: true, botResumeAt: null, lastOutboundAt: new Date() } }),
      prisma.memberNotice.update({ where: { key: c.key }, data: { status: "SENT", error: null, messageId: sent.messageId } }),
    ]);
    return { key: c.key, status: "SENT" };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "Error";
    await prisma.memberNotice.update({ where: { key: c.key }, data: { status: "FAILED", error: msg } }).catch(() => undefined);
    return { key: c.key, status: "FAILED", detail: msg };
  }
}

export type NoticeRun = {
  byKind: Record<string, { candidates: number; sent: number; failed: number; mode: "live" | "test" | "pending-approval" }>;
  candidates: NoticeCandidate[];
};

/** The daily run (cron). Live only where the switch is on AND Meta approved the template. */
export async function runNotices(opts: { now?: Date; dryRun?: boolean; onlyKind?: NoticeKind; userId?: string | null } = {}): Promise<NoticeRun> {
  const now = opts.now ?? new Date();
  const [plans, settings, approved] = await Promise.all([
    planNotices(now),
    prisma.memberNoticeSetting.findMany(),
    opts.dryRun ? Promise.resolve(new Set<string>()) : approvedTemplateNames(),
  ]);
  const live = new Set(settings.filter((s) => s.live).map((s) => s.kind));
  const byKind: NoticeRun["byKind"] = {};
  for (const k of NOTICE_KINDS.filter((x) => x.automatic && (!opts.onlyKind || x.kind === opts.onlyKind))) {
    const list = plans.filter((p) => p.kind === k.kind);
    const mode = !live.has(k.kind) ? "test" : approved.has(k.template) ? "live" : "pending-approval";
    const row = { candidates: list.length, sent: 0, failed: 0, mode: (opts.dryRun ? "test" : mode) as NoticeRun["byKind"][string]["mode"] };
    if (!opts.dryRun && mode === "live") {
      for (const c of list.slice(0, PER_KIND_CAP)) {
        const r = await sendNotice(c, opts.userId ?? null);
        if (r.status === "SENT") row.sent++;
        else if (r.status === "FAILED") row.failed++;
      }
    }
    byKind[k.kind] = row;
  }
  return { byKind, candidates: plans };
}
