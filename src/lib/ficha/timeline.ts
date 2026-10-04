/**
 * La historia de una persona contada una sola vez (ficha única, oct 2026).
 *
 * Lead y socio son la misma persona en dos momentos: la línea de tiempo junta
 * lo que pasó con el lead (cómo llegó, cada contacto, la evaluación) y lo que
 * pasó con el socio (planes, pagos, asistencias, mediciones, notas) en un solo
 * relato, del más reciente al más viejo.
 *
 * No es "use server" a propósito: se llama desde las páginas de la ficha, que
 * ya verificaron la sesión, y recibe al usuario para decidir qué puede ver.
 * Cada entrada que tiene una pantalla propia trae su `href` (regla de Santiago:
 * todo se abre con un click).
 */

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/auth";
import { ECUADOR_TZ } from "@/lib/timezone";
import { STAGE_LABEL } from "@/lib/leads/stages";
import { TEST_LABELS } from "@/lib/portal/test-labels";
import type { User } from "@/generated/prisma/client";
import type { TaskListItem } from "@/lib/tasks/meta";

export type TimelineKind =
  | "nota"
  | "contacto"
  | "whatsapp"
  | "tarea"
  | "membresia"
  | "pago"
  | "asistencia"
  | "salud"
  | "nutricion"
  | "sistema";

export const TIMELINE_KIND_LABEL: Record<TimelineKind, string> = {
  nota: "Notas",
  contacto: "Llamadas y contactos",
  whatsapp: "WhatsApp",
  tarea: "Tareas",
  membresia: "Planes",
  pago: "Pagos y facturas",
  asistencia: "Asistencia",
  salud: "Evaluaciones y medidas",
  nutricion: "Nutrición",
  sistema: "Ciclo de vida",
};

export type TimelineItem = {
  id: string;
  kind: TimelineKind;
  /** ISO, para ordenar. */
  at: string;
  /** Ya formateados en hora de Ecuador: el servidor corre en UTC. */
  monthKey: string;
  monthLabel: string;
  when: string;
  title: string;
  body?: string;
  by?: string;
  href?: string;
  details?: string[];
  tone?: "good" | "warn" | "bad";
};

const SOURCE_LABEL: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
  PHONE_CALL: "Llamada",
  WEB_FORM: "Formulario web",
  WALK_IN: "Visita directa",
  REFERRAL: "Referido",
  TIKTOK: "TikTok",
  OTHER: "Otro",
};

const METHOD_LABEL: Record<string, string> = {
  STRIPE_CARD: "Tarjeta",
  STRIPE_LINK: "Link",
  BANK_TRANSFER: "Transferencia",
  CASH: "Efectivo",
  PLUX_CARD: "TC Plux",
  OTHER: "Otro",
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "borrador",
  SENT: "enviada al SRI",
  AUTHORIZED: "autorizada",
  REJECTED: "devuelta por el SRI",
  VOIDED: "anulada",
};

const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "agendada",
  ATTENDED: "asistió",
  NO_SHOW: "no asistió",
  CANCELLED: "cancelada",
};

const monthFmt = new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric", timeZone: ECUADOR_TZ });
const keyFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: ECUADOR_TZ });
const whenFmt = new Intl.DateTimeFormat("es-EC", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: ECUADOR_TZ,
});
const dayFmt = new Intl.DateTimeFormat("es-EC", { weekday: "short", day: "numeric", month: "short", timeZone: ECUADOR_TZ });
const dateOnlyFmt = new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function money(cents: number) {
  return `$${(cents / 100).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Draft = Omit<TimelineItem, "at" | "monthKey" | "monthLabel" | "when"> & { at: Date | string; dateOnly?: boolean };

function finish(d: Draft): TimelineItem {
  const at = new Date(d.at);
  const label = monthFmt.format(at);
  const { dateOnly, ...rest } = d;
  return {
    ...rest,
    at: at.toISOString(),
    monthKey: keyFmt.format(at),
    monthLabel: label.charAt(0).toUpperCase() + label.slice(1),
    // @db.Date values are midnight UTC: printing them in Ecuador time would
    // move them to the day before.
    when: dateOnly ? dateOnlyFmt.format(at) : whenFmt.format(at),
  };
}

/** Lunes (UTC) de la semana de una fecha, como clave para agrupar asistencias. */
function weekKey(d: Date) {
  const local = new Date(d.toLocaleString("en-US", { timeZone: ECUADOR_TZ }));
  const day = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - day);
  return `${local.getFullYear()}-${local.getMonth()}-${local.getDate()}`;
}

export async function loadPersonTimeline(
  user: User,
  person: { leadId?: string | null; memberId?: string | null },
  closedTasks: TaskListItem[] = [],
): Promise<TimelineItem[]> {
  const { leadId, memberId } = person;
  const seesInbox = can.manageLeads(user);
  const seesPayments = can.viewPayments(user);
  const seesInvoices = can.editFinancials(user);
  const seesNutrition = can.scheduleNutrition(user);

  const conversationWhere = [
    ...(leadId ? [{ leadId }] : []),
    ...(memberId ? [{ memberId }] : []),
  ];

  const [lead, member, conversations] = await Promise.all([
    leadId
      ? prisma.lead.findUnique({
          where: { id: leadId },
          include: {
            owner: { select: { fullName: true } },
            interactions: { orderBy: { occurredAt: "desc" }, include: { user: { select: { fullName: true } } } },
          },
        })
      : null,
    memberId
      ? prisma.member.findUnique({
          where: { id: memberId },
          select: {
            id: true,
            joinedAt: true,
            churnedAt: true,
            churnReason: true,
            memberNotes: { orderBy: { createdAt: "desc" }, include: { author: { select: { fullName: true } } } },
            memberships: { orderBy: { startsAt: "desc" }, include: { plan: { select: { name: true } } } },
            payments: {
              where: { isPoolEntry: false },
              orderBy: { createdAt: "desc" },
              take: 120,
              include: { membership: { select: { plan: { select: { name: true } } } } },
            },
            invoices: { orderBy: { issueDate: "desc" }, take: 60 },
            attendance: {
              where: { recordedAt: { gte: new Date(Date.now() - 365 * 86_400_000) } },
              orderBy: { recordedAt: "desc" },
              include: { classSession: { select: { startAt: true, schedule: { select: { name: true, startTime: true } } } } },
            },
            evaluations: { orderBy: { startedAt: "desc" }, include: { coach: { select: { fullName: true } } } },
            testResults: { orderBy: { recordedAt: "desc" }, take: 200 },
            bodyCompositions: { orderBy: { measuredAt: "desc" }, include: { recordedBy: { select: { fullName: true } } } },
            nutritionAppointments: { orderBy: { startsAt: "desc" }, include: { staff: { select: { fullName: true } } } },
            challengeProgress: {
              where: { completed: true },
              include: { challenge: { select: { id: true, name: true } } },
            },
          },
        })
      : null,
    seesInbox && conversationWhere.length
      ? prisma.conversation.findMany({
          where: { OR: conversationWhere },
          select: {
            id: true,
            messages: {
              where: { createdAt: { gte: new Date(Date.now() - 365 * 86_400_000) } },
              orderBy: { createdAt: "desc" },
              take: 1500,
              select: { createdAt: true, direction: true, body: true, sentByUserId: true, llmGenerated: true, mediaKind: true },
            },
          },
        })
      : [],
  ]);

  const out: Draft[] = [];

  // ── Lead: cómo llegó y cada contacto ────────────────────────────────
  if (lead) {
    const ad = lead.adHeadline ? `Anuncio: “${lead.adHeadline}”` : lead.adSourceId ? `Anuncio ID ${lead.adSourceId}` : null;
    out.push({
      id: `lead-created-${lead.id}`,
      kind: "sistema",
      at: lead.createdAt,
      title: `Llegó como lead por ${SOURCE_LABEL[lead.source] ?? lead.source}`,
      body: [ad, lead.notes].filter(Boolean).join(" · ") || undefined,
      href: lead.adSourceUrl ?? undefined,
    });
    for (const i of lead.interactions) {
      out.push({
        id: `int-${i.id}`,
        // Los cambios de etapa los escribe la app como interacción "Etapa: …".
        kind: /^etapa\b|^→|movid[oa] a/i.test(i.summary) ? "sistema" : "contacto",
        at: i.occurredAt,
        title: SOURCE_LABEL[i.channel] ?? i.channel,
        body: i.summary,
        by: i.user?.fullName ?? undefined,
      });
    }
    if (lead.trialScheduledAt) {
      const past = lead.trialScheduledAt < new Date();
      out.push({
        id: `lead-trial-${lead.id}`,
        kind: "sistema",
        at: lead.trialScheduledAt,
        title: past ? "Cita de evaluación" : "Evaluación agendada",
        body:
          lead.trialAttended == null
            ? past
              ? "Sin registrar si vino."
              : undefined
            : lead.trialAttended
              ? "Asistió."
              : "No asistió.",
        tone: lead.trialAttended === false ? "warn" : lead.trialAttended ? "good" : undefined,
      });
    }
    if (lead.convertedAt) {
      out.push({ id: `lead-conv-${lead.id}`, kind: "sistema", at: lead.convertedAt, title: "Pasó a socio", tone: "good" });
    }
    if ((lead.stage === "LOST" || lead.stage === "DISQUALIFIED") && !member) {
      out.push({
        id: `lead-lost-${lead.id}`,
        kind: "sistema",
        at: lead.updatedAt,
        title: STAGE_LABEL[lead.stage],
        body: lead.lostReason ?? undefined,
        tone: "bad",
      });
    }
  }

  // ── Socio ───────────────────────────────────────────────────────────
  if (member) {
    const base = `/dashboard/socios/${member.id}`;
    out.push({ id: `m-joined-${member.id}`, kind: "sistema", at: member.joinedAt, title: "Ficha de socio creada" });
    if (member.churnedAt) {
      out.push({
        id: `m-churn-${member.id}`,
        kind: "sistema",
        at: member.churnedAt,
        title: "Dado de baja",
        body: member.churnReason ?? undefined,
        tone: "bad",
      });
    }
    for (const n of member.memberNotes) {
      out.push({
        id: `note-${n.id}`,
        kind: "nota",
        at: n.createdAt,
        title: n.visibleToMember ? "Nota · visible en su app" : "Nota",
        body: n.content,
        by: n.author?.fullName ?? undefined,
      });
    }
    for (const m of member.memberships) {
      const price = m.customPriceCents != null ? ` · ${money(m.customPriceCents)}` : "";
      out.push({
        id: `ms-${m.id}`,
        kind: "membresia",
        at: m.createdAt,
        title: `Plan ${m.plan.name}${price}`,
        body: `Del ${dateOnlyFmt.format(m.startsAt)} al ${dateOnlyFmt.format(m.endsAt)}${m.billingNote ? ` · ${m.billingNote}` : ""}`,
        href: `${base}?tab=membresia`,
        tone: m.state === "CANCELED" ? "bad" : undefined,
      });
    }
    if (seesPayments) {
      for (const p of member.payments) {
        const status =
          p.status === "SUCCEEDED" ? "" : p.status === "PENDING" ? " · pendiente" : p.status === "FAILED" ? " · fallido" : p.status === "VOIDED" ? " · anulado" : " · reembolsado";
        out.push({
          id: `pay-${p.id}`,
          kind: "pago",
          at: p.paidAt ?? p.createdAt,
          title: `Pago ${money(p.amountCents)} · ${METHOD_LABEL[p.method] ?? p.method}${status}`,
          body: p.status === "VOIDED" ? `Motivo: ${p.voidReason ?? "—"}` : p.membership?.plan.name ?? p.notes ?? undefined,
          href: `/dashboard/pagos/${p.id}`,
          tone: p.status === "SUCCEEDED" ? "good" : p.status === "PENDING" ? "warn" : "bad",
        });
      }
    }
    if (seesInvoices) {
      for (const f of member.invoices) {
        out.push({
          id: `inv-${f.id}`,
          kind: "pago",
          at: f.issueDate,
          dateOnly: true,
          title: `Factura ${String(f.sequential).padStart(9, "0")} · ${money(f.totalCents)}`,
          body: INVOICE_STATUS_LABEL[f.status] ?? f.status,
          href: `/dashboard/facturas/${f.id}`,
          tone: f.status === "REJECTED" ? "bad" : undefined,
        });
      }
    }

    // Asistencias: una entrada por semana. Una por clase ahogaría todo lo demás.
    const weeks = new Map<string, { first: Date; lines: string[] }>();
    for (const a of member.attendance) {
      const k = weekKey(a.recordedAt);
      const w = weeks.get(k) ?? { first: a.recordedAt, lines: [] };
      const when = a.classSession.startAt ?? a.recordedAt;
      w.lines.push(`${dayFmt.format(when)} · ${a.classSession.schedule?.name ?? "Clase"}${a.classSession.schedule?.startTime ? ` ${a.classSession.schedule.startTime}` : ""}`);
      weeks.set(k, w);
    }
    for (const [k, w] of weeks) {
      out.push({
        id: `att-${k}`,
        kind: "asistencia",
        at: w.first,
        title: `Entrenó ${w.lines.length} ${w.lines.length === 1 ? "vez" : "veces"} esa semana`,
        details: w.lines,
        tone: w.lines.length >= 3 ? "good" : undefined,
      });
    }

    for (const e of member.evaluations) {
      out.push({
        id: `ev-${e.id}`,
        kind: "salud",
        at: e.startedAt,
        title: e.type === "ONBOARDING" ? "Evaluación inicial" : e.type === "CYCLE_9_WEEK" ? `Re-evaluación${e.cycleNumber ? ` · ciclo ${e.cycleNumber}` : ""}` : "Evaluación",
        body: e.summary ?? (e.completedAt ? "Completada" : "En curso"),
        by: e.coach?.fullName ?? undefined,
        href: `/dashboard/srxfit/evaluaciones/${member.id}`,
      });
    }
    // Tests: agrupados por día de registro.
    const testDays = new Map<string, { at: Date; lines: string[]; unverified: number }>();
    for (const t of member.testResults) {
      const k = keyFmt.format(t.recordedAt) + new Intl.DateTimeFormat("en-CA", { day: "2-digit", timeZone: ECUADOR_TZ }).format(t.recordedAt);
      const d = testDays.get(k) ?? { at: t.recordedAt, lines: [], unverified: 0 };
      const spec = TEST_LABELS[t.test];
      d.lines.push(`${spec?.label ?? t.test}: ${t.valueNumeric} ${spec?.unit ?? t.unit}`);
      if (t.source !== "STAFF" && !t.verifiedAt) d.unverified++;
      testDays.set(k, d);
    }
    for (const [k, d] of testDays) {
      out.push({
        id: `tests-${k}`,
        kind: "salud",
        at: d.at,
        title: d.lines.length === 1 ? `Test · ${d.lines[0]}` : `${d.lines.length} tests registrados`,
        details: d.lines.length > 1 ? d.lines : undefined,
        body: d.unverified ? `${d.unverified} registrado${d.unverified === 1 ? "" : "s"} por el socio, sin validar` : undefined,
        href: `/dashboard/srxfit/evaluaciones/${member.id}`,
        tone: d.unverified ? "warn" : undefined,
      });
    }
    for (const b of member.bodyCompositions) {
      const parts = [
        b.weightKg != null ? `${b.weightKg} kg` : null,
        b.bodyFatPct != null ? `${b.bodyFatPct}% grasa` : null,
        b.muscleMassPct != null ? `${b.muscleMassPct}% músculo` : null,
        b.waistCm != null ? `cintura ${b.waistCm} cm` : null,
      ].filter(Boolean);
      const unverified = b.source !== "STAFF" && !b.verifiedAt;
      out.push({
        id: `bc-${b.id}`,
        kind: "salud",
        at: b.measuredAt,
        title: "Medición corporal",
        body: [parts.join(" · "), unverified ? "registrada por el socio, sin validar" : null].filter(Boolean).join(" — ") || undefined,
        by: b.recordedBy?.fullName ?? undefined,
        href: `${base}/medicion/${b.id}`,
        tone: unverified ? "warn" : undefined,
      });
    }
    if (seesNutrition) {
      for (const a of member.nutritionAppointments) {
        out.push({
          id: `nap-${a.id}`,
          kind: "nutricion",
          at: a.startsAt,
          title: `${a.kind === "INITIAL" ? "Primera consulta" : "Control"} con nutrición · ${APPOINTMENT_STATUS_LABEL[a.status] ?? a.status}`,
          by: a.staff.fullName,
          href: `/dashboard/nutricion/citas/${a.id}`,
          tone: a.status === "NO_SHOW" ? "warn" : a.status === "ATTENDED" ? "good" : undefined,
        });
      }
    }
    for (const c of member.challengeProgress) {
      if (!c.completedAt) continue;
      out.push({
        id: `ch-${c.id}`,
        kind: "salud",
        at: c.completedAt,
        title: `Completó el reto “${c.challenge.name}”`,
        href: `/dashboard/retos`,
        tone: "good",
      });
    }
  }

  // ── WhatsApp: un resumen por conversación y día, no cada mensaje ────
  for (const c of conversations) {
    const days = new Map<string, { last: Date; inbound: number; outbound: number; lastInbound?: string; bot: number }>();
    for (const m of c.messages) {
      const k = new Intl.DateTimeFormat("en-CA", { timeZone: ECUADOR_TZ }).format(m.createdAt);
      const d = days.get(k) ?? { last: m.createdAt, inbound: 0, outbound: 0, bot: 0 };
      if (m.direction === "INBOUND") {
        d.inbound++;
        // Los mensajes vienen del más nuevo al más viejo: el primero visto es el último.
        if (d.lastInbound === undefined) d.lastInbound = m.body || (m.mediaKind ? `(${m.mediaKind})` : "");
      } else {
        d.outbound++;
        if (m.llmGenerated && !m.sentByUserId) d.bot++;
      }
      days.set(k, d);
    }
    for (const [k, d] of days) {
      const total = d.inbound + d.outbound;
      const parts = [
        d.inbound ? `${d.inbound} de la persona` : null,
        d.outbound ? `${d.outbound} nuestro${d.outbound === 1 ? "" : "s"}${d.bot ? ` (${d.bot} del agente IA)` : ""}` : null,
      ].filter(Boolean);
      out.push({
        id: `wa-${c.id}-${k}`,
        kind: "whatsapp",
        at: d.last,
        title: `WhatsApp · ${total} mensaje${total === 1 ? "" : "s"}`,
        body: d.lastInbound ? `“${d.lastInbound.slice(0, 160)}${d.lastInbound.length > 160 ? "…" : ""}”` : parts.join(", "),
        details: d.lastInbound ? [parts.join(", ")] : undefined,
        href: `/dashboard/comunicacion?c=${c.id}`,
      });
    }
  }

  // ── Tareas cerradas (las abiertas viven en la columna derecha) ──────
  for (const t of closedTasks) {
    if (!t.doneAt) continue;
    out.push({
      id: `task-${t.id}`,
      kind: "tarea",
      at: t.doneAt,
      title: `Tarea hecha · ${t.title}`,
      body: t.outcome ?? undefined,
      by: t.doneByName ?? undefined,
      href: `/dashboard/tareas?t=${t.id}`,
      tone: "good",
    });
  }

  return out
    .map(finish)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
