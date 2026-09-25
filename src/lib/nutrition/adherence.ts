// Daily adherence (semáforo) from the plan blocks a socio marked. Pure.

export type AdherenceLevel = "GREEN" | "YELLOW" | "ORANGE" | "RED";

export const ADHERENCE_META: Record<AdherenceLevel, { label: string; hint: string; color: string; emoji: string }> = {
  GREEN: { label: "Verde", hint: "+80%", color: "#16a34a", emoji: "🟢" },
  YELLOW: { label: "Amarillo", hint: "60–80%", color: "#eab308", emoji: "🟡" },
  ORANGE: { label: "Naranja", hint: "40–60%", color: "#f97316", emoji: "🟠" },
  RED: { label: "Rojo", hint: "–40%", color: "#ef4444", emoji: "🔴" },
};

export function levelFromPct(pct: number): AdherenceLevel {
  if (pct > 80) return "GREEN";
  if (pct >= 60) return "YELLOW";
  if (pct >= 40) return "ORANGE";
  return "RED";
}

/**
 * % of the day's plan meals followed. Until the socio marks something the
 * day has no color (null) — an unmarked morning isn't a red day.
 */
export function adherenceFromChecks(
  enabledMeals: string[],
  checks: { mealKey: string; ate: boolean }[],
): { pct: number; level: AdherenceLevel | null; followed: number; marked: number } {
  const enabled = new Set(enabledMeals);
  const relevant = checks.filter((c) => enabled.has(c.mealKey));
  const followed = relevant.filter((c) => c.ate).length;
  if (relevant.length === 0 || enabled.size === 0) return { pct: 0, level: null, followed: 0, marked: 0 };
  const pct = Math.round((followed / enabled.size) * 100);
  return { pct, level: levelFromPct(pct), followed, marked: relevant.length };
}

/** ISO weekday (1 = lunes … 7 = domingo) of an Ecuador-local "YYYY-MM-DD". */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}
