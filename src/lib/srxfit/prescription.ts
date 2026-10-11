// "Tu prescripción de hoy" (Manual SRXFIT v3, 8.3 and 8.4): turns the socio's
// profile and recent data into the adjustment of the day's complementary
// stations. Pure — tested in scripts/test-prescripcion.ts.
//
// Limits from the manual: only the stations change, never the main lift's
// scheme; never more than one step away from the class base; rules that lower
// the dose win over rules that raise it; the coach can always override.
// Rules 3 (pain) and 4 (calorie deficit) are not evaluated: the app has no
// data for them yet.

import { estimate1Rm, exerciseKey, type MainSet } from "@/lib/self-log/main-set";

export type Profile = "A" | "B" | "C" | "D" | "E" | "F";
export type Step = "half" | "down" | "base" | "up";

export type PrescriptionInput = {
  phase: string;
  sex: "MALE" | "FEMALE" | "OTHER" | null;
  age: number | null;
  menopausal: "PRE" | "PERI" | "POST" | null;
  level: 1 | 2 | 3 | null;
  /** Weeks since the socio started training; null when unknown. */
  weeksTraining: number | null;
  /** Days since the last visit before today; null when there is none. */
  daysSinceLastVisit: number | null;
  /** Visits in the 14 / 21 days before today. */
  visitsLast14: number;
  visitsLast21: number;
  compositionGoal: boolean;
  /** The socio's logged main sets, newest first. */
  mainSets: Array<MainSet & { exercise: string; daysAgo: number }>;
};

export type Prescription = {
  step: Step;
  /** 8.4 rule that decided it; null = class base. */
  rule: 1 | 2 | 5 | 6 | 7 | 8 | null;
  profile: Profile | null;
  headline: string;
  detail: string;
  reasons: string[];
  /** Profile priorities of 8.3 (impact, power, balance). */
  priorities: string[];
};

export function profileFor(input: Pick<PrescriptionInput, "sex" | "age" | "menopausal">): Profile | null {
  const { sex, age, menopausal } = input;
  if (age != null && age >= 60) return "F";
  if (sex === "FEMALE") {
    if (menopausal === "POST") return "C";
    if (menopausal === "PERI") return "B";
    return "A";
  }
  if (sex === "MALE") {
    if (age == null) return null;
    return age < 40 ? "D" : "E";
  }
  return null;
}

function prioritiesFor(profile: Profile | null, age: number | null): string[] {
  switch (profile) {
    case "B":
      return [
        "Saltos: suma 20–30 saltos bajos en la activación, además del primer.",
        "Potencia: no te saltes el primer de potencia.",
        "Si hoy dormiste mal o tienes síntomas, baja un paso. Decide el día.",
      ];
    case "C":
      return [
        "Impacto: haz el primer completo y progresa el aterrizaje.",
        "Potencia: no te saltes el primer de potencia.",
        "Carga pesada en el principal si tu técnica lo permite.",
        "Equilibrio: recomendado.",
      ];
    case "E":
      return age != null && age >= 50
        ? ["Potencia e impacto: no te saltes el primer de potencia.", "Equilibrio: recomendado."]
        : ["Potencia: no te saltes el primer de potencia."];
    case "F":
      return [
        "Impacto: bajo y progresivo.",
        "Potencia: cargas ligeras, movidas rápido.",
        "Equilibrio: en cada sesión.",
        "Incluye levantarte del suelo.",
      ];
    default:
      return [];
  }
}

/** Rule 5: the estimated 1RM of the same lift fell two sessions in a row at the same load, within the last week. */
export function strengthDrop(sets: PrescriptionInput["mainSets"]): string | null {
  if (sets.length < 3 || sets[0].daysAgo > 7) return null;
  const key = exerciseKey(sets[0].exercise);
  const same = sets.filter((s) => exerciseKey(s.exercise) === key).slice(0, 3);
  if (same.length < 3) return null;
  const [last, mid, first] = same;
  const sameLoad = last.loadKg === mid.loadKg && mid.loadKg === first.loadKg;
  return sameLoad && estimate1Rm(last) < estimate1Rm(mid) && estimate1Rm(mid) < estimate1Rm(first) ? last.exercise : null;
}

export function prescribe(input: PrescriptionInput): Prescription {
  const profile = profileFor(input);
  const priorities = prioritiesFor(profile, input.age);
  const out = (p: Omit<Prescription, "profile" | "priorities">): Prescription => ({ ...p, profile, priorities });

  // Rule 8, with 9.2: the deload is for whoever accumulated load.
  if (input.phase === "Recuperar" && input.visitsLast21 >= 6) {
    return out({
      step: "half",
      rule: 8,
      headline: "Mitad de series, misma carga",
      detail: "En las estaciones haz la mitad de las series de la clase con tu carga habitual, sin acercarte al fallo.",
      reasons: ["Es semana de recuperar: baja el volumen, no la intensidad."],
    });
  }

  const down: Array<{ rule: 1 | 2 | 5; reason: string }> = [];
  if (input.weeksTraining != null && input.weeksTraining < 8) down.push({ rule: 1, reason: "Llevas menos de 8 semanas entrenando." });
  else if (input.level === 1) down.push({ rule: 1, reason: "Estás en Nivel 1." });
  if (input.daysSinceLastVisit != null && input.daysSinceLastVisit >= 7) {
    down.push({ rule: 2, reason: `Vuelves tras ${input.daysSinceLastVisit} días sin entrenar.` });
  } else if (input.daysSinceLastVisit != null && input.visitsLast14 < 4) {
    down.push({ rule: 2, reason: "Viniste menos de 2 veces por semana en las últimas dos semanas." });
  }
  const dropped = strengthDrop(input.mainSets);
  if (dropped) down.push({ rule: 5, reason: `Tu fuerza estimada en ${dropped} bajó dos sesiones seguidas con la misma carga.` });

  if (down.length) {
    const first = down[0].rule;
    return out({
      step: "down",
      rule: first,
      headline: first === 2 ? "Una serie menos que la clase y carga liviana" : "Una serie menos que la clase",
      detail:
        first === 1
          ? "En las estaciones deja 3 o 4 repeticiones en reserva y cuida la técnica antes que la carga."
          : first === 2
            ? "En las estaciones haz una serie menos y elige una carga liviana hoy."
            : "En las estaciones haz una serie menos durante esta semana.",
      reasons: down.map((d) => d.reason),
    });
  }

  const threeDays = input.visitsLast14 >= 6;
  if ((profile === "C" || profile === "F") && threeDays) {
    return out({
      step: "up",
      rule: 6,
      headline: "Una serie más en tu grupo prioritario",
      detail: "En la estación de tu grupo prioritario suma una serie y termina cerca del fallo, con buena técnica.",
      reasons: ["Vienes 3 o más días por semana y tu perfil responde mejor con más trabajo complementario."],
    });
  }
  if (input.compositionGoal && threeDays && input.weeksTraining != null && input.weeksTraining > 26) {
    return out({
      step: "up",
      rule: 7,
      headline: "Una serie más en tu grupo prioritario",
      detail: "En la estación de tu grupo prioritario suma una serie y termina con 0 o 1 repetición en reserva.",
      reasons: ["Tu objetivo es composición corporal, vienes 3 o más días por semana y llevas más de 6 meses."],
    });
  }

  return out({
    step: "base",
    rule: null,
    headline: "La base de la clase",
    detail: "Haz las estaciones como las anuncia tu coach.",
    reasons:
      input.phase === "Recuperar"
        ? ["Es semana de recuperar, pero viniste poco en las últimas tres semanas: mantén tus series habituales."]
        : [],
  });
}
