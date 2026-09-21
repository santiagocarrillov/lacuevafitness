/** Etiquetas y formatos que comparten el listado del inbox y los resultados de búsqueda. */

export const SEDE_LABEL: Record<string, string> = {
  FITNESS_CENTER: "Fitness",
  XTREME: "Xtreme",
};

export const STAGE_LABEL: Record<string, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  SCHEDULED_TRIAL: "Agendado",
  TRIAL_ATTENDED: "Asistió",
  TRIAL_NO_SHOW: "No asistió",
  NEGOTIATING: "Negociando",
  CONVERTED: "Cerrado",
  LOST: "Perdido",
};

/** Solo la hora: para la fila de una conversación de hoy. */
export function timeShort(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-EC", { hour: "2-digit", minute: "2-digit", hour12: true }).format(
    new Date(iso),
  );
}

/** Separador de día dentro del hilo. */
export function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short" }).format(new Date(iso));
}

/**
 * Fecha para un resultado de búsqueda: puede ser de hace meses, así que la hora
 * sola no ubica a nadie. Hoy → hora; este año → día y mes; antes → con año.
 */
export function hitDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return timeShort(iso);
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}
