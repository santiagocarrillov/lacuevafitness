/**
 * El contacto detrás de una conversación.
 *
 * Una conversación pertenece a un número de teléfono. Ese número puede ser de un
 * lead (alguien que todavía no compra) o de un socio (alguien que ya entrena con
 * nosotros) — son dos vistas de la misma persona en momentos distintos, y el
 * inbox necesita hablar de "quién es" sin preguntar cuál de las dos tablas lo
 * guarda. Este módulo es esa traducción, y el único sitio donde se decide.
 */

import type { LeadStage, MemberStatus, Sede } from "@/generated/prisma/client";

export type ConversationContact = {
  kind: "lead" | "member";
  name: string;
  phone: string | null;
  leadId: string | null;
  memberId: string | null;
  /** Etapa del embudo. null cuando el contacto ya es socio. */
  stage: LeadStage | null;
  /** Estado del socio. null cuando todavía es lead. */
  memberStatus: MemberStatus | null;
  sede: Sede | null;
};

type LeadLike = {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  stage: LeadStage;
  sede: Sede;
};

type MemberLike = {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  status: MemberStatus;
  sede: Sede;
};

export function contactOf(
  conversation: { lead?: LeadLike | null; member?: MemberLike | null },
): ConversationContact {
  const { lead, member } = conversation;
  if (lead) {
    return {
      kind: "lead",
      name: fullName(lead.firstName, lead.lastName),
      phone: lead.phone,
      leadId: lead.id,
      memberId: null,
      stage: lead.stage,
      memberStatus: null,
      sede: lead.sede,
    };
  }
  if (member) {
    return {
      kind: "member",
      name: fullName(member.firstName, member.lastName),
      phone: member.phone,
      leadId: null,
      memberId: member.id,
      stage: null,
      memberStatus: member.status,
      sede: member.sede,
    };
  }
  // El CHECK de la BD lo impide, pero una fila vieja o un include incompleto no
  // pueden tumbar el inbox entero.
  return {
    kind: "lead",
    name: "Sin contacto",
    phone: null,
    leadId: null,
    memberId: null,
    stage: null,
    memberStatus: null,
    sede: null,
  };
}

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim() || "Sin nombre";
}

/**
 * Los últimos 9 dígitos del número, que es lo que de verdad identifica a una
 * persona en Ecuador. El mismo celular aparece como `0986615931` en la ficha del
 * socio y como `593986615931` en el wa_id; comparar las cadenas crudas nunca
 * encuentra nada. Devuelve null si no hay suficientes dígitos para arriesgarse.
 */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}
