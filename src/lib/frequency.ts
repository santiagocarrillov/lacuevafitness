// Attendance-frequency buckets based on visits in the last 30 days.
// Thresholds (decided with the team): 0 = Inactivo, 1–6 = Viene poco,
// 7–11 = Regular, 12+ = Frecuente.

export type FrequencyBucket = "INACTIVO" | "POCO" | "REGULAR" | "FRECUENTE";

export function frequencyBucket(visitsLast30: number): FrequencyBucket {
  if (visitsLast30 <= 0) return "INACTIVO";
  if (visitsLast30 <= 6) return "POCO";
  if (visitsLast30 <= 11) return "REGULAR";
  return "FRECUENTE";
}

export const FREQUENCY_META: Record<
  FrequencyBucket,
  { label: string; cls: string }
> = {
  INACTIVO: { label: "Inactivo", cls: "bg-red-50 text-red-700 border-red-200" },
  POCO: { label: "Viene poco", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  REGULAR: { label: "Regular", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  FRECUENTE: { label: "Frecuente", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};
