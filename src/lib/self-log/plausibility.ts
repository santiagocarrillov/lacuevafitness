// "Verde o revisar" for a socio's self-reported entry, judged against their
// last OFFICIAL data (staff-taken or already validated). Pure functions — the
// queue page and scripts/test-validar.ts both use them.
//
// Green = the coach can validate without thinking (a plausible step from a
// known mark). Amber = look before validating. Nothing is ever validated
// automatically (Santiago, 5 oct 2026): green only enables "Validar todos los
// verdes", a coach still taps it.

export type Check = { green: true; note: string } | { green: false; note: string };

/** Biggest jump over the previous best that still reads as a normal PR. */
const MAX_LIFT_JUMP = 0.15; // +15 % in kg
const MAX_REPS_JUMP_PCT = 0.3; // +30 % in reps…
const MAX_REPS_JUMP_ABS = 5; // …or +5 reps, whichever is larger

/** Above this, it's amber whatever the history says (strong amateur ceilings). */
const LIFT_X_BODYWEIGHT: Record<string, number> = {
  BACK_SQUAT_3RM: 2.75,
  DEADLIFT_3RM: 3,
  BENCH_PRESS_3RM: 2,
  PUSH_PRESS_3RM: 1.6,
  CLEAN_JERK_1RM: 1.8,
  SNATCH_1RM: 1.5,
};
const MAX_PULL_UPS = 40;

function pct(delta: number, base: number) {
  return Math.round((delta / base) * 1000) / 10;
}

function signed(n: number, unit: string) {
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? "+" : ""}${r} ${unit}`;
}

/**
 * A lift / pull-up PR. `previousBest` is the socio's best official mark for
 * that test (null = none yet); `bodyWeightKg` their latest official weight.
 */
export function checkPr(input: {
  test: string;
  value: number;
  unit: string;
  previousBest: number | null;
  bodyWeightKg: number | null;
}): Check {
  const { test, value, unit, previousBest, bodyWeightKg } = input;

  if (unit === "reps" && value > MAX_PULL_UPS) {
    return { green: false, note: `Más de ${MAX_PULL_UPS} repeticiones` };
  }
  const ratio = LIFT_X_BODYWEIGHT[test];
  if (ratio && bodyWeightKg && value > bodyWeightKg * ratio) {
    return { green: false, note: `${Math.round((value / bodyWeightKg) * 10) / 10}× su peso corporal` };
  }

  if (previousBest == null || previousBest <= 0) {
    return { green: false, note: "Sin marca oficial anterior" };
  }

  const delta = value - previousBest;
  if (delta <= 0) {
    return { green: true, note: delta === 0 ? "Igual a su mejor marca" : `${Math.round(-delta * 10) / 10} ${unit} bajo su mejor marca` };
  }
  const limit =
    unit === "reps"
      ? Math.max(MAX_REPS_JUMP_ABS, previousBest * MAX_REPS_JUMP_PCT)
      : previousBest * MAX_LIFT_JUMP;
  const label = `${signed(delta, unit)} (${pct(delta, previousBest) > 0 ? "+" : ""}${pct(delta, previousBest)} %)`;
  return delta > limit ? { green: false, note: `Salto grande: ${label}` } : { green: true, note: label };
}

/** Fields a socio can self-report, with how much they may move vs. the last official value. */
export const MEASUREMENT_FIELDS = [
  { key: "weightKg", label: "Peso", unit: "kg", maxChange: 0.06 },
  { key: "waistCm", label: "Cintura", unit: "cm", maxChange: 0.08 },
  { key: "hipCm", label: "Cadera", unit: "cm", maxChange: 0.08 },
  { key: "chestCm", label: "Pecho", unit: "cm", maxChange: 0.08 },
  { key: "armCm", label: "Brazo", unit: "cm", maxChange: 0.1 },
  { key: "thighCm", label: "Muslo", unit: "cm", maxChange: 0.1 },
] as const;

export type MeasurementKey = (typeof MEASUREMENT_FIELDS)[number]["key"];
export type MeasurementValues = Partial<Record<MeasurementKey, number | null>>;

/**
 * A home weigh-in / tape measurement. Each field is compared with the last
 * official value of that same field; one big move turns the whole entry amber.
 */
export function checkMeasurement(entry: MeasurementValues, previous: MeasurementValues): Check & { lines: string[] } {
  const lines: string[] = [];
  const flags: string[] = [];
  let compared = 0;

  for (const f of MEASUREMENT_FIELDS) {
    const v = entry[f.key];
    if (v == null) continue;
    const before = previous[f.key];
    if (before == null || before <= 0) {
      lines.push(`${f.label} ${v} ${f.unit}`);
      continue;
    }
    compared++;
    const delta = v - before;
    lines.push(`${f.label} ${v} ${f.unit} (${signed(delta, f.unit)})`);
    if (Math.abs(delta) > before * f.maxChange) flags.push(`${f.label} ${signed(delta, f.unit)}`);
  }

  if (flags.length) return { green: false, note: `Cambio grande: ${flags.join(", ")}`, lines };
  if (compared === 0) return { green: false, note: "Sin medida oficial anterior", lines };
  return { green: true, note: "Cambios normales", lines };
}
