/**
 * SRXFIT — Linter del método v3 (reglas R7–R12 del system prompt).
 * Revisa lo que el Manual v3 fija por semana y por sesión: orden de días (7.4),
 * separación Bisagra/Jalón, isométricos (7.2), día de Rotación, intervalo largo
 * (7.1 regla 3) y ubicación de estaciones en mesociclo de fuerza (7.3, en prueba).
 * El primer de potencia lo exige el schema.
 */
import type { Week, Session } from "./schema";

export interface MethodViolation {
  rule:
    | "day-order"
    | "separation"
    | "isometric-session"
    | "isometric-lower"
    | "rotation-stations"
    | "long-interval"
    | "strength-stations";
  detail: string;
}

type Pattern = Session["pattern"];

/** Matriz de 7.4: el orden avanza un puesto cada dos semanas. */
export const ROTATION_ORDER: Record<string, Pattern[]> = {
  "1-2": ["Empuje", "Bisagra", "Unilateral", "Rotación", "Jalón"],
  "3-4": ["Bisagra", "Unilateral", "Rotación", "Jalón", "Empuje"],
  "5-6": ["Unilateral", "Rotación", "Jalón", "Empuje", "Bisagra"],
  "7-8": ["Rotación", "Jalón", "Empuje", "Bisagra", "Unilateral"],
};

const isStrengthEmphasis = (emphasis: string) => /fuerza/i.test(emphasis);
const isLongInterval = (s: Session) =>
  s.acondicionamiento.format === "Intervalos" && s.acondicionamiento.zone === "Z4";

export function lintWeekMethod(week: Week): MethodViolation[] {
  const violations: MethodViolation[] = [];

  // En la semana 9 el test es el único movimiento del bloque de Fuerza.
  if (week.phase === "Reevaluación") return violations;

  const weekdays = week.sessions.filter((s) => s.dayIndex <= 5).sort((a, b) => a.dayIndex - b.dayIndex);

  // Las semanas Desafiar ensayan el orden de la semana 9: ahí no aplica la matriz.
  if (!week.isTestWeek) {
    const expected = ROTATION_ORDER[week.rotationKey];
    if (expected) {
      for (const s of weekdays) {
        const want = expected[s.dayIndex - 1];
        if (s.pattern !== want) {
          violations.push({
            rule: "day-order",
            detail: `${s.dayName}: el patrón es "${s.pattern}" y en la rotación ${week.rotationKey} toca "${want}".`,
          });
        }
      }
    }

    const heavy = (p: Pattern) => p === "Bisagra" || p === "Jalón";
    for (let i = 0; i < weekdays.length; i++) {
      // El viernes se compara con el lunes: la quincena repite el orden.
      const a = weekdays[i];
      const b = weekdays[(i + 1) % weekdays.length];
      if (a !== b && heavy(a.pattern) && heavy(b.pattern) && a.pattern !== b.pattern) {
        violations.push({
          rule: "separation",
          detail: `${a.dayName} (${a.pattern}) y ${b.dayName} (${b.pattern}) van seguidos: Bisagra y Jalón necesitan al menos un día entre ellos.`,
        });
      }
    }
  }

  let lowerIsometricDays = 0;
  for (const s of week.sessions) {
    const isometrics = s.fuerza.stations.filter((st) => st.kind === "isométrico");
    if (isometrics.length === 0) {
      violations.push({
        rule: "isometric-session",
        detail: `${s.dayName}: falta la estación isométrica (mínimo una por sesión).`,
      });
    }
    if (isometrics.some((st) => st.region === "inferior")) lowerIsometricDays++;

    if (s.pattern === "Rotación") {
      const rotation = s.fuerza.stations.filter(
        (st) => st.kind === "rotación" || (st.kind === "isométrico" && st.region === "core"),
      );
      if (rotation.length < 2) {
        violations.push({
          rule: "rotation-stations",
          detail: `${s.dayName}: el día de Rotación tiene ${rotation.length} estación(es) de rotación o anti-rotación (mínimo 2).`,
        });
      }
    }

    if (isStrengthEmphasis(week.blockEmphasis)) {
      for (const st of s.fuerza.stations) {
        if (st.kind === "sinergista" && st.placement === "entre series") {
          violations.push({
            rule: "strength-stations",
            detail: `${s.dayName}: "${st.name}" es sinergista y va entre series; en mesociclo de fuerza va después del principal.`,
          });
        }
      }
    }
  }
  if (lowerIsometricDays < 2) {
    violations.push({
      rule: "isometric-lower",
      detail: `Solo ${lowerIsometricDays} día(s) con isométrico de tren inferior (mínimo 2 en la semana).`,
    });
  }

  // Intervalo largo: uno por semana, en el día Unilateral (o el sábado si el Unilateral cae en viernes).
  if (!week.isTestWeek && week.phase !== "Recuperar") {
    const long = week.sessions.filter(isLongInterval);
    const unilateral = weekdays.find((s) => s.pattern === "Unilateral");
    if (long.length !== 1) {
      violations.push({
        rule: "long-interval",
        detail: `Hay ${long.length} sesiones con intervalo largo (Intervalos en Z4); debe haber exactamente una.`,
      });
    } else if (unilateral) {
      const day = long[0];
      const onUnilateral = day.dayIndex === unilateral.dayIndex;
      const movedToSaturday = unilateral.dayIndex === 5 && day.dayIndex === 6;
      if (!onUnilateral && !movedToSaturday) {
        violations.push({
          rule: "long-interval",
          detail: `El intervalo largo está en ${day.dayName} (${day.pattern}); va en el día Unilateral (${unilateral.dayName}).`,
        });
      }
    }
  }

  return violations;
}
