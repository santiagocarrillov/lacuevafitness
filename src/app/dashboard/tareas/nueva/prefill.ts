import { prisma } from "@/lib/prisma";
import { can } from "@/lib/auth";
import { ECUADOR_TZ } from "@/lib/timezone";
import { contactOf } from "@/lib/whatsapp/contact";
import { TYPE_LABEL, type PersonRef, type TaskType } from "@/lib/tasks/meta";
import type { User } from "@/generated/prisma/client";
import type { TaskPrefill } from "../new-task-form";

export type TaskPrefillParams = {
  /** Member id: the task is about this socio. */
  socio?: string;
  /** Lead id (front-desk roles only). */
  lead?: string;
  /** WhatsApp message id: "Seguimiento a …" quoting that message (inbox only). */
  mensaje?: string;
  titulo?: string;
  notas?: string;
  tipo?: string;
};

const fullName = (p: { firstName: string; lastName: string | null }) =>
  [p.firstName, p.lastName].filter(Boolean).join(" ").trim();

const dayLabel = (d: Date) =>
  new Intl.DateTimeFormat("es-EC", { timeZone: ECUADOR_TZ, day: "numeric", month: "short" }).format(d);
const timeShort = (d: Date) =>
  new Intl.DateTimeFormat("es-EC", { timeZone: ECUADOR_TZ, hour: "2-digit", minute: "2-digit", hour12: true }).format(d);

/**
 * What the "nueva tarea" page starts with. Ids travel in the URL and are
 * resolved here, so names and message text never sit in the query string.
 */
export async function resolveTaskPrefill(user: User, params: TaskPrefillParams): Promise<TaskPrefill> {
  const prefill: TaskPrefill = {};
  if (params.titulo) prefill.title = params.titulo.slice(0, 200);
  if (params.notas) prefill.detail = params.notas.slice(0, 2000);
  if (params.tipo && params.tipo in TYPE_LABEL) prefill.type = params.tipo as TaskType;

  // Same people the person picker offers: any socio; leads only for the front desk.
  if (params.mensaje && can.manageLeads(user)) {
    const m = await prisma.message.findUnique({
      where: { id: params.mensaje },
      select: {
        direction: true,
        llmGenerated: true,
        sentByUserId: true,
        body: true,
        createdAt: true,
        conversation: {
          select: {
            lead: { select: { id: true, firstName: true, lastName: true, phone: true, stage: true, sede: true } },
            member: { select: { id: true, firstName: true, lastName: true, phone: true, status: true, sede: true } },
          },
        },
      },
    });
    if (m) {
      const contact = contactOf(m.conversation);
      const sender =
        m.direction === "INBOUND"
          ? "Cliente"
          : m.llmGenerated
            ? "Agente IA"
            : !m.sentByUserId
              ? "Automático"
              : ((await prisma.user.findUnique({ where: { id: m.sentByUserId }, select: { fullName: true } }))?.fullName ?? "Staff");
      prefill.title ??= `Seguimiento a ${contact.name.split(" ")[0]}`;
      prefill.detail ??= `${sender} escribió el ${dayLabel(m.createdAt)} a las ${timeShort(m.createdAt)}:\n«${m.body}»`;
      const id = contact.kind === "member" ? contact.memberId : contact.leadId;
      if (id) prefill.person = { kind: contact.kind, id, name: contact.name };
    }
  }

  if (!prefill.person && params.socio) {
    const member = await prisma.member.findUnique({
      where: { id: params.socio },
      select: { id: true, firstName: true, lastName: true },
    });
    if (member) prefill.person = { kind: "member", id: member.id, name: fullName(member) } satisfies PersonRef;
  }

  if (!prefill.person && params.lead && can.manageLeads(user)) {
    const lead = await prisma.lead.findUnique({
      where: { id: params.lead },
      select: { id: true, firstName: true, lastName: true },
    });
    if (lead) prefill.person = { kind: "lead", id: lead.id, name: fullName(lead) };
  }

  return prefill;
}
