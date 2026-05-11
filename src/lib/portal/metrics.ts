/**
 * Pure derivations for the member portal. Server-side only; inputs come from
 * Prisma queries already scoped to a single Member.
 */

export type HitoSpec = { target: number; label: string };

export const HITOS: HitoSpec[] = [
  { target: 30, label: "30 asistencias" },
  { target: 60, label: "60 asistencias" },
  { target: 100, label: "100 asistencias" },
];

export function computeImc(weightKg?: number | null, heightCm?: number | null) {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function interpretImc(imc: number) {
  if (imc < 18.5) return { dot: "orange" as const, text: "Bajo peso." };
  if (imc < 25) return { dot: "green" as const, text: "Rango saludable." };
  if (imc < 30) return { dot: "orange" as const, text: "Sobrepeso." };
  return { dot: "orange" as const, text: "Obesidad." };
}

/**
 * "Racha": number of consecutive ISO weeks ending in the current week where
 * the member had at least one Attendance. Returns 0 if no current-week visit.
 */
export function computeStreak(
  attendanceDates: Date[],
  now: Date = new Date(),
): number {
  if (attendanceDates.length === 0) return 0;
  const weekKeys = new Set(attendanceDates.map(isoWeekKey));
  let streak = 0;
  let cursor = isoWeekStart(now);
  // Allow same-week even if today's visit hasn't happened yet
  for (;;) {
    if (weekKeys.has(isoWeekKey(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - 7 * 86400000);
    } else {
      break;
    }
  }
  return streak;
}

function isoWeekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7; // Sun=0 -> 7
  if (day !== 1) x.setUTCDate(x.getUTCDate() - (day - 1));
  return x;
}

function isoWeekKey(d: Date): string {
  const w = isoWeekStart(d);
  return `${w.getUTCFullYear()}-${w.getUTCMonth() + 1}-${w.getUTCDate()}`;
}

/**
 * Greeting text for the time of day, in Ecuador local time.
 */
export function greetingForHour(hour: number): string {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

/**
 * Days remaining until the next SRXFit re-evaluation (every 9 weeks = 63 days
 * after the last completed evaluation). Returns null if there is no evaluation.
 * Can be negative if the cycle is overdue.
 */
export function daysToNextEvaluation(
  lastEvaluatedAt: Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!lastEvaluatedAt) return null;
  const target = new Date(lastEvaluatedAt.getTime() + 63 * 86400000);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / 86400000);
}
