// Calorie & macro calculator (pure). Used by the nutritionist's calculator panel,
// the plan editor sidebar and the socio's "Calcula tu meta" wizard.

export type CalcSex = "MALE" | "FEMALE" | "OTHER";

export const ACTIVITY_LEVELS = {
  sedentary: { factor: 1.2, label: "Sedentario (casi sin ejercicio)" },
  light: { factor: 1.375, label: "Ligero (1–3 entrenos/semana)" },
  moderate: { factor: 1.55, label: "Moderado (3–5 entrenos/semana)" },
  active: { factor: 1.725, label: "Activo (6–7 entrenos/semana)" },
  very_active: { factor: 1.9, label: "Muy activo (2 sesiones/día o trabajo físico)" },
} as const;
export type ActivityLevel = keyof typeof ACTIVITY_LEVELS;

export const GOALS = {
  lose_fast: { delta: -0.2, label: "Bajar grasa (déficit 20%)" },
  lose: { delta: -0.12, label: "Bajar grasa suave (déficit 12%)" },
  maintain: { delta: 0, label: "Mantener" },
  recomp: { delta: -0.05, label: "Recomposición (déficit 5%)" },
  gain: { delta: 0.1, label: "Ganar músculo (superávit 10%)" },
} as const;
export type Goal = keyof typeof GOALS;

export type BmrMethod = "measured" | "katch" | "mifflin";

export const BMR_METHOD_LABEL: Record<BmrMethod, string> = {
  measured: "Bioimpedancia (medido)",
  katch: "Katch-McArdle (con % grasa)",
  mifflin: "Mifflin-St Jeor",
};

export type CalcInput = {
  sex: CalcSex | null;
  ageYears: number;
  weightKg: number;
  heightCm: number;
  bodyFatPct?: number | null;
  measuredBmr?: number | null; // BodyComposition.basalMetabolism
  activity: ActivityLevel;
  goal: Goal;
  proteinPerKg?: number; // default depends on goal
  fatPct?: number; // % of kcal from fat, default 27
};

export type CalcResult = {
  bmr: number;
  bmrMethod: BmrMethod;
  tdee: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  proteinPerKg: number;
  warnings: string[];
};

/** Mifflin-St Jeor. OTHER/unknown sex uses the midpoint of the two constants. */
export function mifflinStJeor(sex: CalcSex | null, weightKg: number, heightCm: number, ageYears: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  const k = sex === "MALE" ? 5 : sex === "FEMALE" ? -161 : -78;
  return base + k;
}

/** Katch-McArdle — needs body-fat %; better than Mifflin for lean or very muscular people. */
export function katchMcArdle(weightKg: number, bodyFatPct: number): number {
  const lbm = weightKg * (1 - bodyFatPct / 100);
  return 370 + 21.6 * lbm;
}

export function ageFrom(dateOfBirth: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const m = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) age--;
  return age;
}

const DEFAULT_PROTEIN_PER_KG: Record<Goal, number> = {
  lose_fast: 2.2,
  lose: 2.0,
  recomp: 2.0,
  maintain: 1.6,
  gain: 1.8,
};

/**
 * Daily target. BMR preference: a measured value (bioimpedance) > Katch-McArdle
 * when body fat is known > Mifflin-St Jeor. Protein is set per kg of body
 * weight, fat as a % of kcal, carbs fill the rest.
 */
export function calculateTarget(input: CalcInput): CalcResult {
  const warnings: string[] = [];
  let bmr: number;
  let bmrMethod: BmrMethod;
  if (input.measuredBmr && input.measuredBmr > 600) {
    bmr = input.measuredBmr;
    bmrMethod = "measured";
  } else if (input.bodyFatPct && input.bodyFatPct > 3 && input.bodyFatPct < 70) {
    bmr = katchMcArdle(input.weightKg, input.bodyFatPct);
    bmrMethod = "katch";
  } else {
    bmr = mifflinStJeor(input.sex, input.weightKg, input.heightCm, input.ageYears);
    bmrMethod = "mifflin";
  }

  const tdee = bmr * ACTIVITY_LEVELS[input.activity].factor;
  let kcal = tdee * (1 + GOALS[input.goal].delta);

  // Never prescribe below BMR by default — flag it instead of silently clamping.
  if (kcal < bmr) warnings.push("La meta queda por debajo del metabolismo basal.");
  const floor = input.sex === "MALE" ? 1500 : 1200;
  if (kcal < floor) {
    warnings.push(`Se ajustó al mínimo de ${floor} kcal.`);
    kcal = floor;
  }
  kcal = Math.round(kcal / 10) * 10;

  const proteinPerKg = input.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG[input.goal];
  const proteinG = Math.round(input.weightKg * proteinPerKg);
  const fatPct = input.fatPct ?? 27;
  const fatG = Math.round((kcal * fatPct) / 100 / 9);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  if (carbsG < 50) warnings.push("Quedan menos de 50 g de carbohidratos: revisa proteína o grasa.");

  return {
    bmr: Math.round(bmr),
    bmrMethod,
    tdee: Math.round(tdee),
    kcal,
    proteinG,
    carbsG,
    fatG,
    proteinPerKg,
    warnings,
  };
}
