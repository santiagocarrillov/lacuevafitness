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
  lose_fast: { delta: -0.2, label: "Bajar grasa rápido (déficit 20%, con % de grasa alto)" },
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
  /** g per kg of `proteinRefKg` — the weight an explicit `proteinPerKg` override is applied to. */
  proteinPerKg: number;
  /** Total weight, or the weight at BMI 30 when BMI > 30. */
  proteinRefKg: number;
  bmi: number | null;
  warnings: string[];
  /** How protein/deficit were adjusted; shown to staff and socios. */
  notes: string[];
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

/** BMI the protein reference weight is capped at (Weijs 2024). */
const REFERENCE_BMI = 30;
/**
 * Above BMI 30 protein slides from the regular formula (at BMI 30) to the
 * obesity formula (from BMI 35) so the number doesn't jump while typing.
 * Design choice, not evidence.
 */
const TAPER_END_BMI = 35;
/** g/kg of reference weight once fully in the obesity formula (~Morton 2018 plateau). */
const OBESITY_PROTEIN_PER_REF_KG = 1.6;
/** Floor: ≥1.2 g/kg of reference weight (Weijs 2024). */
const MIN_PROTEIN_PER_REF_KG = 1.2;
/** g/kg of fat-free mass when body fat is known (Helms 2014 / ISSN 2017: 2.3–3.1 in deficit). */
const PROTEIN_PER_FFM_KG: Record<Goal, number> = {
  lose_fast: 2.6,
  lose: 2.4,
  recomp: 2.4,
  maintain: 2.0,
  gain: 2.2,
};

/** Body fat % from which a 20% deficit is allowed (ACE "obese" cut-offs; OTHER = midpoint). */
function highBodyFatPct(sex: CalcSex | null): number {
  return sex === "MALE" ? 25 : sex === "FEMALE" ? 32 : 28.5;
}

function validBodyFat(pct: number | null | undefined): number | null {
  return pct && pct > 3 && pct < 70 ? pct : null;
}

const fmt1 = (n: number) => n.toFixed(1).replace(".", ",");

/**
 * Daily target. BMR preference: a measured value (bioimpedance) > Katch-McArdle
 * when body fat is known > Mifflin-St Jeor. Protein is set per kg of body
 * weight, fat as a % of kcal, carbs fill the rest.
 *
 * With BMI > 30 protein uses a reference weight (the weight at BMI 30) instead
 * of total weight, or g/kg of fat-free mass when body fat is known. The 20%
 * deficit only applies with high body fat; otherwise it falls back to 12%.
 */
export function calculateTarget(input: CalcInput): CalcResult {
  const warnings: string[] = [];
  const notes: string[] = [];
  const bodyFatPct = validBodyFat(input.bodyFatPct);
  const heightM = input.heightCm / 100;
  const bmi = heightM > 0 ? input.weightKg / (heightM * heightM) : null;
  let bmr: number;
  let bmrMethod: BmrMethod;
  if (input.measuredBmr && input.measuredBmr > 600) {
    bmr = input.measuredBmr;
    bmrMethod = "measured";
  } else if (bodyFatPct) {
    bmr = katchMcArdle(input.weightKg, bodyFatPct);
    bmrMethod = "katch";
  } else {
    bmr = mifflinStJeor(input.sex, input.weightKg, input.heightCm, input.ageYears);
    bmrMethod = "mifflin";
  }

  const tdee = bmr * ACTIVITY_LEVELS[input.activity].factor;
  // 20% only with high body fat (measured, or BMI ≥ 30 when unmeasured); leaner people go slower.
  let delta: number = GOALS[input.goal].delta;
  if (input.goal === "lose_fast") {
    const highFat = bodyFatPct ? bodyFatPct >= highBodyFatPct(input.sex) : bmi !== null && bmi >= REFERENCE_BMI;
    if (!highFat) {
      delta = GOALS.lose.delta;
      notes.push(`El déficit de 20% es solo para % de grasa alto; se aplicó ${Math.round(-delta * 100)}%.`);
    }
  }
  let kcal = tdee * (1 + delta);

  // Never prescribe below BMR by default — flag it instead of silently clamping.
  if (kcal < bmr) warnings.push("La meta queda por debajo del metabolismo basal.");
  const floor = input.sex === "MALE" ? 1500 : 1200;
  if (kcal < floor) {
    warnings.push(`Se ajustó al mínimo de ${floor} kcal.`);
    kcal = floor;
  }
  kcal = Math.round(kcal / 10) * 10;

  const goalPerKg = DEFAULT_PROTEIN_PER_KG[input.goal];
  let proteinPerKg: number;
  let proteinRefKg = input.weightKg;
  let proteinG: number;
  if (bmi === null || bmi <= REFERENCE_BMI) {
    proteinPerKg = input.proteinPerKg ?? goalPerKg;
    proteinG = Math.round(input.weightKg * proteinPerKg);
  } else {
    proteinRefKg = REFERENCE_BMI * heightM * heightM;
    const ffmKg = bodyFatPct ? input.weightKg * (1 - bodyFatPct / 100) : null;
    let raw: number;
    if (input.proteinPerKg) {
      raw = input.proteinPerKg * proteinRefKg;
    } else {
      const atThreshold = goalPerKg * proteinRefKg;
      // Never above what total weight would give (very muscular people), never below Weijs' floor.
      const obesity = ffmKg
        ? Math.min(Math.max(PROTEIN_PER_FFM_KG[input.goal] * ffmKg, MIN_PROTEIN_PER_REF_KG * proteinRefKg), goalPerKg * input.weightKg)
        : OBESITY_PROTEIN_PER_REF_KG * proteinRefKg;
      const t = Math.min(1, (bmi - REFERENCE_BMI) / (TAPER_END_BMI - REFERENCE_BMI));
      raw = atThreshold + (obesity - atThreshold) * t;
    }
    proteinG = Math.round(raw);
    proteinPerKg = input.proteinPerKg ?? Math.round((raw / proteinRefKg) * 10) / 10;
    notes.push(
      `IMC ${fmt1(bmi)}: la proteína se calcula sobre un peso de referencia de ${fmt1(proteinRefKg)} kg (IMC 30), no sobre el peso total.` +
        (ffmKg ? ` Equivale a ${fmt1(raw / ffmKg)} g/kg de masa libre de grasa (${fmt1(ffmKg)} kg).` : ""),
    );
  }
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
    proteinRefKg: Math.round(proteinRefKg * 10) / 10,
    bmi: bmi === null ? null : Math.round(bmi * 10) / 10,
    warnings,
    notes,
  };
}
