/**
 * El ciclo de vida de una persona, en un solo sitio.
 *
 * Antes las etiquetas vivían duplicadas en la tabla de Leads y en el inbox, y se
 * habían desincronizado ("C.P. agendada" vs "Agendado"). Peor: el 22 sep 2026
 * descubrimos que `Lead.stage` y `Member.status` se contradecían en la misma
 * persona (el lead decía NEGOTIATING con Fitness Center mientras la socia ya
 * entrenaba y pagaba en Xtreme). Este módulo es la respuesta a las dos cosas.
 *
 * **La regla:** mientras NO hay socio, `Lead.stage` es la verdad. En cuanto
 * existe un `Member`, la verdad es `Member.status` y la etapa del lead deja de
 * editarse. Nunca dos fuentes para el mismo hecho.
 *
 * Y un matiz de negocio que Santiago fijó el 22 sep: **pagar los $9 NO es ser
 * socio activo.** Las dos semanas son un lead magnet al precio de los gimnasios
 * del sector; activo es quien paga la mensualidad. La tasa de evaluación →
 * activo es el número que dice si el trabajo se hizo bien.
 */

import type { LeadStage, MemberStatus } from "@/generated/prisma/client";

/** Orden del embudo. Las salidas (no califica, perdido) van al final. */
export const LEAD_STAGES: readonly LeadStage[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "SCHEDULED_TRIAL",
  "TRIAL_NO_SHOW",
  "TRIAL_ATTENDED",
  "NEGOTIATING",
  "CONVERTED",
  "DISQUALIFIED",
  "LOST",
];

export const STAGE_LABEL: Record<LeadStage, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  QUALIFIED: "Calificado",
  SCHEDULED_TRIAL: "Agendado",
  TRIAL_NO_SHOW: "No asistió",
  TRIAL_ATTENDED: "En evaluación",
  NEGOTIATING: "Negociando",
  CONVERTED: "Socio activo",
  DISQUALIFIED: "No califica",
  LOST: "Perdido",
};

export const STAGE_COLOR: Record<LeadStage, string> = {
  NEW: "text-blue-700 bg-blue-50 border-blue-200",
  CONTACTED: "text-indigo-700 bg-indigo-50 border-indigo-200",
  QUALIFIED: "text-sky-700 bg-sky-50 border-sky-200",
  SCHEDULED_TRIAL: "text-purple-700 bg-purple-50 border-purple-200",
  TRIAL_NO_SHOW: "text-amber-700 bg-amber-50 border-amber-200",
  TRIAL_ATTENDED: "text-teal-700 bg-teal-50 border-teal-200",
  NEGOTIATING: "text-orange-700 bg-orange-50 border-orange-200",
  CONVERTED: "text-emerald-700 bg-emerald-50 border-emerald-200",
  DISQUALIFIED: "text-slate-700 bg-slate-100 border-slate-300",
  LOST: "text-red-700 bg-red-50 border-red-200",
};

/** Cómo se lee el estado de un socio, con las mismas palabras que el embudo. */
export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  LEAD: "Ficha sin activar",
  TRIAL: "En evaluación",
  ACTIVE: "Socio activo",
  PAUSED: "Pausado",
  CHURNED: "Dado de baja",
};

export const MEMBER_STATUS_COLOR: Record<MemberStatus, string> = {
  LEAD: "text-slate-700 bg-slate-100 border-slate-300",
  TRIAL: "text-teal-700 bg-teal-50 border-teal-200",
  ACTIVE: "text-emerald-700 bg-emerald-50 border-emerald-200",
  PAUSED: "text-amber-700 bg-amber-50 border-amber-200",
  CHURNED: "text-red-700 bg-red-50 border-red-200",
};

/**
 * Etapas que ya no se editan a mano desde el embudo: las dicta el socio.
 * Marcar "Socio activo" no es poner una etiqueta, es registrar una mensualidad.
 */
export const MEMBER_OWNED_STAGES: readonly LeadStage[] = ["TRIAL_ATTENDED", "CONVERTED"];
