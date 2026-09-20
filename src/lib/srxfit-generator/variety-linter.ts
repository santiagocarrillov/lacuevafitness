/**
 * SRXFIT — Variety linter (Regla R1, auto-validable).
 * Convierte el criterio de Santiago en una GARANTÍA: rechaza semanas que repiten
 * formato o sobre-repiten movimientos de acondicionamiento, salvo semanas de test.
 *
 * Hallazgo que motiva esto: en el plan base de la IA, 18/18 semanas repetían el
 * formato de acondicionamiento dentro de la semana; run/KB swing/ring row aparecían 3–5x/sem.
 */
import type { Week } from "./schema";

export interface Violation {
  rule: "format-repeat" | "movement-overuse";
  detail: string;
}

/** Normaliza un movimiento a una clave canónica para detectar repetición. */
export function normalizeMovement(raw: string): string {
  const m = raw
    .toLowerCase()
    .replace(/[0-9]+/g, "")
    .replace(/×|x\b/g, "")
    .replace(/\b(reps?|min|seg|mts?|m|rondas?|por tiempo|lado|cada)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const KEYWORDS = [
    "run", "row", "kb swing", "swing", "wall ball", "burpee", "box jump",
    "thruster", "devil press", "lunge", "toes to bar", "snatch", "clean",
    "squat", "push up", "push-up", "farmer", "skater", "sit up", "rope", "soga",
    "man maker", "v-up", "jump", "carry",
  ];
  for (const k of KEYWORDS) if (m.includes(k)) return k;
  return m;
}

/**
 * Valida la regla de variedad de acondicionamiento de una semana.
 * @returns lista de violaciones (vacía = la semana pasa).
 */
export function lintWeekVariety(week: Week): Violation[] {
  const violations: Violation[] = [];

  // Excepción R1: en semanas de test la uniformidad ligera es intencional.
  if (week.isTestWeek) return violations;

  // Solo días de semana (excluir sábado full-body, dayIndex 6).
  const weekdays = week.sessions.filter((s) => s.dayIndex <= 5);

  // 1) Formato de acondicionamiento único por día.
  const formatCount = new Map<string, number>();
  for (const s of weekdays) {
    const f = s.acondicionamiento.format;
    formatCount.set(f, (formatCount.get(f) ?? 0) + 1);
  }
  for (const [fmt, n] of formatCount) {
    if (n > 1) {
      violations.push({
        rule: "format-repeat",
        detail: `El formato de acondicionamiento "${fmt}" se repite en ${n} días (máximo 1).`,
      });
    }
  }

  // 2) Ningún movimiento de acondicionamiento en más de 2 días.
  const movDays = new Map<string, Set<number>>();
  for (const s of weekdays) {
    for (const mv of s.acondicionamiento.movements) {
      const key = normalizeMovement(mv);
      if (!key) continue;
      if (!movDays.has(key)) movDays.set(key, new Set());
      movDays.get(key)!.add(s.dayIndex);
    }
  }
  for (const [mv, days] of movDays) {
    if (days.size > 2) {
      violations.push({
        rule: "movement-overuse",
        detail: `El movimiento "${mv}" aparece en ${days.size} días (máximo 2).`,
      });
    }
  }

  return violations;
}

export function isWeekValid(week: Week): boolean {
  return lintWeekVariety(week).length === 0;
}
