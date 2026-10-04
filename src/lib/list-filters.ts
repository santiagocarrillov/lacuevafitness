// Date presets shared by the list filters (Leads, Socios) and the links that
// open those lists already filtered (the Resumen funnel). Ecuador time.
import { ecuadorDateAt, ecuadorParts, todayDateUtc } from "@/lib/timezone";

export const CREATED_PRESETS = [
  { value: "hoy", label: "Hoy" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "mes", label: "Este mes" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "90d", label: "Últimos 90 días" },
  { value: "anio", label: "Este año" },
];

export const ACTIVITY_PRESETS = [
  { value: "7d", label: "En los últimos 7 días" },
  { value: "30d", label: "En los últimos 30 días" },
  { value: "sin30", label: "Sin actividad hace 30+ días" },
  { value: "nunca", label: "Nunca" },
];

/** Start of a "since" preset, or null when the value is unknown. */
export function presetStart(preset: string | undefined): Date | null {
  if (!preset) return null;
  const today = ecuadorDateAt(todayDateUtc(), 0, 0);
  const day = 86_400_000;
  const { year, month } = ecuadorParts();
  switch (preset) {
    case "hoy":
      return today;
    case "7d":
      return new Date(today.getTime() - 6 * day);
    case "30d":
      return new Date(today.getTime() - 29 * day);
    case "90d":
      return new Date(today.getTime() - 89 * day);
    case "mes":
      return ecuadorDateAt(new Date(Date.UTC(year, month - 1, 1)), 0, 0);
    case "anio":
      return ecuadorDateAt(new Date(Date.UTC(year, 0, 1)), 0, 0);
    default:
      return null;
  }
}
