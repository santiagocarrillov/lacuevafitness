// Health reference ranges + status evaluation. Pure functions, no IO.

export type Status = "green" | "yellow" | "red" | "unknown";
export type Sex = "MALE" | "FEMALE" | "OTHER";
export type MenoStatus = "PRE" | "PERI" | "POST";

export type RangeBand = { label: string; min?: number; max?: number };
export type RangeSpec = {
  unit: string;
  bands: { green: string; yellow: string; red: string };
  note?: string;
  ageAdjusted: boolean;
};

export function computeAge(dob: Date | string | null | undefined, today = new Date()): number | null {
  if (!dob) return null;
  const d = typeof dob === "string" ? new Date(dob) : dob;
  if (isNaN(d.getTime())) return null;
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

// ─── Auto-calc helpers ───────────────────────────────────────────────

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function whtr(waistCm: number, heightCm: number): number {
  return waistCm / heightCm;
}

export function trigHdl(triglycerides: number, hdl: number): number {
  return triglycerides / hdl;
}

// ─── % Body fat (age + sex adjusted) ─────────────────────────────────

const BF_MEN: Array<[number, [number, number], [number, number], number]> = [
  // [maxAgeInclusive, greenRange, yellowRange, redMin]
  [29, [10, 16], [17, 22], 23],
  [39, [12, 18], [19, 23], 24],
  [49, [14, 20], [21, 25], 26],
  [59, [16, 22], [23, 27], 28],
  [200, [18, 24], [25, 29], 30],
];
const BF_WOMEN: Array<[number, [number, number], [number, number], number]> = [
  [29, [16, 24], [25, 30], 31],
  [39, [18, 26], [27, 32], 33],
  [49, [20, 28], [29, 34], 35],
  [59, [22, 30], [31, 36], 37],
  [200, [24, 32], [33, 38], 39],
];

function bfBracket(age: number, sex: Sex) {
  const table = sex === "FEMALE" ? BF_WOMEN : BF_MEN;
  return table.find(([maxAge]) => age <= maxAge)!;
}

export function evaluateBodyFat(value: number | null | undefined, age: number | null, sex: Sex | null) {
  if (value == null || age == null || !sex || sex === "OTHER") return { status: "unknown" as Status, range: null };
  const dangerLow = sex === "FEMALE" ? 14 : 8;
  if (value < dangerLow) return { status: "red" as Status, range: bandsBfRange(age, sex), note: "Demasiado bajo: riesgo hormonal." };
  const [, green, yellow, redMin] = bfBracket(age, sex);
  let status: Status = "red";
  if (value >= green[0] && value <= green[1]) status = "green";
  else if (value >= yellow[0] && value <= yellow[1]) status = "yellow";
  else if (value >= redMin) status = "red";
  else if (value < green[0]) status = "yellow";
  return { status, range: bandsBfRange(age, sex) };
}

export function bandsBfRange(age: number, sex: Sex): RangeSpec {
  const [, g, y, r] = bfBracket(age, sex);
  return {
    unit: "%",
    bands: {
      green: `${g[0]}-${g[1]}%`,
      yellow: `${y[0]}-${y[1]}%`,
      red: `≥${r}%`,
    },
    ageAdjusted: true,
    note: `${sex === "FEMALE" ? "Mujer" : "Hombre"} · ${age} años. <${sex === "FEMALE" ? 14 : 8}% también es zona roja por riesgo hormonal.`,
  };
}

// ─── % Muscle mass (age + sex) ───────────────────────────────────────

// Computed as (muscleMassKg / weightKg) * 100
const MM_MEN: Array<[number, [number, number], [number, number], number]> = [
  [39, [40, 50], [35, 39], 35],
  [49, [38, 48], [33, 37], 33],
  [59, [36, 46], [31, 35], 31],
  [200, [34, 44], [29, 33], 29],
];
const MM_WOMEN: Array<[number, [number, number], [number, number], number]> = [
  [39, [35, 42], [30, 34], 30],
  [49, [33, 40], [28, 32], 28],
  [59, [31, 38], [26, 30], 26],
  [200, [29, 36], [24, 28], 24],
];

function mmBracket(age: number, sex: Sex) {
  const table = sex === "FEMALE" ? MM_WOMEN : MM_MEN;
  return table.find(([maxAge]) => age <= maxAge)!;
}

export function evaluateMusclePct(pct: number | null | undefined, age: number | null, sex: Sex | null) {
  if (pct == null || age == null || !sex || sex === "OTHER") return { status: "unknown" as Status, range: null };
  const [, green, yellow, redMax] = mmBracket(age, sex);
  let status: Status = "red";
  if (pct >= green[0] && pct <= green[1]) status = "green";
  else if (pct >= yellow[0] && pct <= yellow[1]) status = "yellow";
  else if (pct < redMax) status = "red";
  else if (pct > green[1]) status = "green";
  return { status, range: bandsMmRange(age, sex) };
}

export function bandsMmRange(age: number, sex: Sex): RangeSpec {
  const [, g, y, r] = mmBracket(age, sex);
  return {
    unit: "%",
    bands: {
      green: `${g[0]}-${g[1]}%`,
      yellow: `${y[0]}-${y[1]}%`,
      red: `<${r}%`,
    },
    ageAdjusted: true,
    note: `${sex === "FEMALE" ? "Mujer" : "Hombre"} · ${age} años. % calculado como masa muscular / peso × 100.`,
  };
}

// ─── Waist circumference (universal by sex) ──────────────────────────

export function evaluateWaist(value: number | null | undefined, sex: Sex | null) {
  if (value == null || !sex || sex === "OTHER") return { status: "unknown" as Status, range: null };
  const isMale = sex === "MALE";
  let status: Status;
  if (isMale) {
    status = value < 90 ? "green" : value <= 101 ? "yellow" : "red";
  } else {
    status = value < 80 ? "green" : value <= 87 ? "yellow" : "red";
  }
  return { status, range: bandsWaistRange(sex) };
}

export function bandsWaistRange(sex: Sex): RangeSpec {
  const isMale = sex === "MALE";
  return {
    unit: "cm",
    bands: isMale
      ? { green: "<90 cm", yellow: "90-101 cm", red: "≥102 cm" }
      : { green: "<80 cm", yellow: "80-87 cm", red: "≥88 cm" },
    ageAdjusted: false,
    note: "Universal · medir a nivel del ombligo, final de espiración normal.",
  };
}

// ─── Waist-to-height ratio ───────────────────────────────────────────

export function evaluateWHtR(ratio: number | null | undefined) {
  if (ratio == null) return { status: "unknown" as Status, range: bandsWHtRRange() };
  let status: Status;
  if (ratio < 0.5) status = "green";
  else if (ratio < 0.6) status = "yellow";
  else status = "red";
  return { status, range: bandsWHtRRange() };
}

export function bandsWHtRRange(): RangeSpec {
  return {
    unit: "",
    bands: { green: "<0.50", yellow: "0.50-0.59", red: "≥0.60" },
    ageAdjusted: false,
    note: "Universal. Cintura / altura.",
  };
}

// ─── BMI ─────────────────────────────────────────────────────────────

export function evaluateBMI(value: number | null | undefined) {
  if (value == null) return { status: "unknown" as Status, range: bandsBMIRange() };
  let status: Status;
  if (value >= 18.5 && value < 25) status = "green";
  else if ((value >= 25 && value < 30) || (value >= 17 && value < 18.5)) status = "yellow";
  else status = "red";
  return { status, range: bandsBMIRange() };
}

export function bandsBMIRange(): RangeSpec {
  return {
    unit: "",
    bands: { green: "18.5-24.9", yellow: "25.0-29.9 o 17.0-18.4", red: "≥30 o <17" },
    ageAdjusted: false,
    note: "IMC tiene limitaciones para deportistas. Músculo pesa más que grasa. Usar junto con % grasa y cintura.",
  };
}

// ─── Glucose fasting ─────────────────────────────────────────────────

export function evaluateGlucose(value: number | null | undefined) {
  if (value == null) return { status: "unknown" as Status, range: bandsGlucoseRange() };
  let status: Status;
  if (value >= 70 && value <= 90) status = "green";
  else if (value >= 91 && value <= 99) status = "yellow";
  else status = "red";
  return { status, range: bandsGlucoseRange() };
}

export function bandsGlucoseRange(): RangeSpec {
  return {
    unit: "mg/dL",
    bands: { green: "70-90 mg/dL", yellow: "91-99 mg/dL", red: "≥100 o <70 mg/dL" },
    ageAdjusted: false,
    note: "Ayuno mínimo 8h. 100-125 = prediabetes · ≥126 = diabetes (confirmar con médico).",
  };
}

// ─── Trig/HDL ratio ──────────────────────────────────────────────────

export function evaluateTrigHdl(value: number | null | undefined) {
  if (value == null) return { status: "unknown" as Status, range: bandsTrigHdlRange() };
  let status: Status;
  if (value < 2) status = "green";
  else if (value <= 3.5) status = "yellow";
  else status = "red";
  return { status, range: bandsTrigHdlRange() };
}

export function bandsTrigHdlRange(): RangeSpec {
  return {
    unit: "",
    bands: { green: "<2.0 (ideal <1.5)", yellow: "2.0-3.5", red: ">3.5" },
    ageAdjusted: false,
    note: "Mejor predictor de resistencia a insulina y riesgo cardiovascular que colesterol total.",
  };
}

// ─── hs-CRP ──────────────────────────────────────────────────────────

export function evaluateHsCRP(value: number | null | undefined) {
  if (value == null) return { status: "unknown" as Status, range: bandsHsCRPRange() };
  let status: Status;
  if (value < 1) status = "green";
  else if (value <= 3) status = "yellow";
  else status = "red";
  return { status, range: bandsHsCRPRange() };
}

export function bandsHsCRPRange(): RangeSpec {
  return {
    unit: "mg/L",
    bands: { green: "<1.0 mg/L", yellow: "1.0-3.0 mg/L", red: ">3.0 mg/L" },
    ageAdjusted: false,
    note: "Inflamación sistémica. >10 mg/L = probable infección aguda (repetir cuando sane).",
  };
}

// ─── Free testosterone (men, age-adjusted) ───────────────────────────

const TT_MEN: Array<[number, [number, number], [number, number], number]> = [
  [29, [9.0, 30.0], [7.0, 8.9], 7.0],
  [39, [8.0, 28.0], [6.5, 7.9], 6.5],
  [49, [7.5, 26.0], [6.0, 7.4], 6.0],
  [200, [6.5, 24.0], [5.0, 6.4], 5.0],
];

export function evaluateTestosterone(value: number | null | undefined, age: number | null, sex: Sex | null) {
  if (value == null) return { status: "unknown" as Status, range: null };
  if (sex === "FEMALE") {
    const status: Status = value >= 0.1 && value <= 0.85 ? "green" : "yellow";
    return {
      status,
      range: { unit: "ng/dL", bands: { green: "0.1-0.85 ng/dL", yellow: "fuera de rango", red: "—" }, ageAdjusted: false, note: "Mujeres · valores de referencia." } as RangeSpec,
    };
  }
  if (age == null || sex !== "MALE") return { status: "unknown" as Status, range: null };
  const [, green, yellow, redMax] = TT_MEN.find(([m]) => age <= m)!;
  let status: Status = "red";
  if (value >= green[0] && value <= green[1]) status = "green";
  else if (value >= yellow[0] && value <= yellow[1]) status = "yellow";
  else if (value < redMax) status = "red";
  else if (value > green[1]) status = "green";
  return { status, range: bandsTestosteroneRange(age, sex) };
}

export function bandsTestosteroneRange(age: number, sex: Sex): RangeSpec {
  if (sex === "FEMALE") {
    return { unit: "ng/dL", bands: { green: "0.1-0.85 ng/dL", yellow: "fuera de rango", red: "—" }, ageAdjusted: false };
  }
  const [, g, y, r] = TT_MEN.find(([m]) => age <= m)!;
  return {
    unit: "ng/dL",
    bands: {
      green: `${g[0]}-${g[1]} ng/dL`,
      yellow: `${y[0]}-${y[1]} ng/dL`,
      red: `<${r} ng/dL`,
    },
    ageAdjusted: true,
    note: "Tomar muestra entre 8-10 AM. Valores bajos persistentes: derivar a endocrinólogo.",
  };
}

// ─── Estradiol E2 ────────────────────────────────────────────────────

export function evaluateEstradiol(
  value: number | null | undefined,
  sex: Sex | null,
  meno: MenoStatus | null,
  cycleDay: number | null,
) {
  if (value == null) return { status: "unknown" as Status, range: null };
  if (sex === "MALE") {
    const status: Status = value >= 10 && value <= 40 ? "green" : "yellow";
    return {
      status,
      range: { unit: "pg/mL", bands: { green: "10-40 pg/mL", yellow: "fuera de rango", red: "—" }, ageAdjusted: false, note: "Hombres · muy alto puede indicar exceso de aromatización." } as RangeSpec,
    };
  }
  if (sex === "FEMALE") {
    if (meno === "POST") {
      let status: Status;
      if (value >= 10 && value <= 30) status = "green";
      else if (value < 10) status = "yellow";
      else status = "yellow";
      return {
        status,
        range: { unit: "pg/mL", bands: { green: "10-30 pg/mL", yellow: "<10 pg/mL", red: "muy bajo + síntomas severos" }, ageAdjusted: false, note: "Posmenopausia." } as RangeSpec,
      };
    }
    if (cycleDay != null) {
      let phase: { name: string; min: number; max: number };
      if (cycleDay <= 7) phase = { name: "Folicular temprana (1-7)", min: 30, max: 100 };
      else if (cycleDay <= 14) phase = { name: "Mitad del ciclo (8-14)", min: 100, max: 400 };
      else phase = { name: "Fase luteínica (15-28)", min: 50, max: 200 };
      const status: Status = value >= phase.min && value <= phase.max ? "green" : "yellow";
      return {
        status,
        range: {
          unit: "pg/mL",
          bands: {
            green: `${phase.min}-${phase.max} pg/mL`,
            yellow: "fuera de rango",
            red: "—",
          },
          ageAdjusted: false,
          note: `${phase.name}. Día ${cycleDay} del ciclo. Anticonceptivos hormonales alteran valores.`,
        } as RangeSpec,
      };
    }
    return { status: "unknown" as Status, range: null };
  }
  return { status: "unknown" as Status, range: null };
}

// ─── Trend (vs previous measurement) ─────────────────────────────────

export type TrendDir = "up" | "down" | "flat" | "none";
export type TrendInfo = {
  dir: TrendDir;
  arrow: "↑" | "↓" | "→" | "—";
  pctChange: number | null;
  isPositive: boolean | null; // null when no prior
};

export function trend(
  current: number | null | undefined,
  previous: number | null | undefined,
  betterDirection: "up" | "down" | "neutral",
): TrendInfo {
  if (current == null || previous == null) return { dir: "none", arrow: "—", pctChange: null, isPositive: null };
  if (previous === 0) return { dir: "none", arrow: "—", pctChange: null, isPositive: null };
  const pct = ((current - previous) / previous) * 100;
  const abs = Math.abs(pct);
  if (abs < 2) return { dir: "flat", arrow: "→", pctChange: pct, isPositive: null };
  if (pct > 0) {
    return { dir: "up", arrow: "↑", pctChange: pct, isPositive: betterDirection === "up" };
  }
  return { dir: "down", arrow: "↓", pctChange: pct, isPositive: betterDirection === "down" };
}

// ─── Longevity score ─────────────────────────────────────────────────

export type LongevityMarkers = {
  glucose: Status;
  trigHdl: Status;
  hsCRP: Status;
  testosterone: Status;
  estradiol: Status;
  waist: Status;
  whtr: Status;
};

export function longevityScore(m: LongevityMarkers) {
  const arr = Object.values(m);
  const greens = arr.filter((s) => s === "green").length;
  const evaluated = arr.filter((s) => s !== "unknown").length;
  let status: Status;
  let interpretation: string;
  if (greens >= 5) {
    status = "green";
    interpretation = "Mantener estrategia nutricional y ajustar detalles finos según objetivo.";
  } else if (greens >= 3) {
    status = "yellow";
    interpretation = "Priorizar adherencia, proteína, calidad de carbohidratos, sueño y reducción de grasa visceral.";
  } else {
    status = "red";
    interpretation = "Requiere intervención nutricional más estructurada y posible derivación médica si hay marcadores clínicos alterados.";
  }
  return { greens, evaluated, max: 7, status, interpretation };
}

export function recommendations(input: {
  glucose: Status;
  trigHdl: Status;
  hsCRP: Status;
  waist: Status;
  testosterone: Status;
  glucoseValue?: number | null;
  trigHdlValue?: number | null;
  hsCRPValue?: number | null;
}): string[] {
  const recs: string[] = [];
  if (input.glucose === "yellow" || input.glucose === "red") {
    recs.push("Reducir carbohidratos refinados y azúcares.");
  }
  if (input.trigHdl === "yellow" || input.trigHdl === "red") {
    recs.push("Priorizar proteína y grasas saludables, reducir carbohidratos refinados.");
  }
  if (input.hsCRP === "yellow" || input.hsCRP === "red") {
    recs.push("Investigar fuentes de inflamación: sueño, estrés, alimentación.");
  }
  if (input.waist === "yellow" || input.waist === "red") {
    recs.push("Priorizar reducción de grasa visceral.");
  }
  if (input.testosterone === "yellow" || input.testosterone === "red") {
    recs.push("Revisar sueño, manejo de estrés, composición corporal.");
  }
  return recs;
}

// ─── Status → tailwind classes ───────────────────────────────────────

export const STATUS_STYLES: Record<Status, { dot: string; pill: string; text: string }> = {
  green:   { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-800 border-emerald-200",  text: "text-emerald-700" },
  yellow:  { dot: "bg-amber-500",   pill: "bg-amber-50 text-amber-800 border-amber-200",        text: "text-amber-700" },
  red:     { dot: "bg-red-500",     pill: "bg-red-50 text-red-800 border-red-200",              text: "text-red-700" },
  unknown: { dot: "bg-zinc-300",    pill: "bg-zinc-50 text-zinc-600 border-zinc-200",           text: "text-zinc-500" },
};
