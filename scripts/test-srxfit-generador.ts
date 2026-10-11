/**
 * Pruebas de los linters del generador SRXFIT (sin API ni base de datos).
 * npx tsx scripts/test-srxfit-generador.ts
 * Una semana que cumple el Manual v3 pasa; cada regla rota se detecta sola.
 */
import { weekSchema, type Week, type Session } from "../src/lib/srxfit-generator/schema";
import { lintWeekMethod, ROTATION_ORDER } from "../src/lib/srxfit-generator/method-linter";
import { lintWeekVariety } from "../src/lib/srxfit-generator/variety-linter";

let fails = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) fails++;
  console.log(`${ok ? "✓" : "✗"} ${what}`);
};

type Pattern = Session["pattern"];
type Station = Session["fuerza"]["stations"][number];
const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const FORMATS = ["AMRAP", "EMOM", "RFT", "Tabata", "Estaciones", "Parejas"] as const;
const MOVES = [["burpee"], ["wall ball"], ["row"], ["thruster"], ["farmer carry"], ["run"]];

const st = (name: string, kind: Station["kind"], region: Station["region"], placement: Station["placement"]): Station => ({
  name, reps: "3 × 10", target: name, kind, region, placement,
});

function stationsFor(pattern: Pattern, strength: boolean): Station[] {
  const after = "después del principal" as const;
  const sinergista = strength ? after : ("entre series" as const);
  switch (pattern) {
    case "Bisagra":
      return [st("Hip thrust", "sinergista", "inferior", sinergista), st("Wall sit", "isométrico", "inferior", "entre series")];
    case "Unilateral":
      return [st("Isquio a una pierna", "sinergista", "inferior", sinergista), st("Split squat isométrico", "isométrico", "inferior", "entre series")];
    case "Rotación":
      return [st("Chop con banda", "rotación", "core", "entre series"), st("Pallof sostenido", "isométrico", "core", "entre series")];
    case "Jalón":
      return [st("Curl de bíceps", "sinergista", "superior", sinergista), st("Dead hang activo", "isométrico", "superior", "entre series")];
    default:
      return [st("Tríceps", "sinergista", "superior", sinergista), st("Sostén de push-up", "isométrico", "superior", "entre series")];
  }
}

function session(dayIndex: number, pattern: Pattern, strength: boolean): Session {
  const longInterval = pattern === "Unilateral";
  return {
    dayIndex,
    dayName: DAYS[dayIndex - 1],
    pattern,
    dayType: "Equilibrado",
    activacion: { durationMin: 9, movilidad: ["cadera"], rounds: "2", cardio: "Z2", rules: [] },
    fuerza: {
      durationMin: 25,
      powerPrimer: { exercise: "Broad jump", dose: "4 × 3", lowImpact: "Swing" },
      mainExercise: "Principal",
      scheme: "4 × 8 · RPE 7",
      scaling: { n1: "-", n2: "-", n3: "-" },
      stations: stationsFor(pattern, strength),
      coachNote: "Por qué + cue",
    },
    acondicionamiento: {
      durationMin: 12,
      format: longInterval ? "Intervalos" : FORMATS[dayIndex - 1],
      zone: longInterval ? "Z4" : "Z3",
      description: "-",
      movements: MOVES[dayIndex - 1],
      scaling: { n1: "-", n2: "-", n3: "-" },
    },
    regulacion: { durationMin: 5, mobility: ["couch stretch"], breathing: "4-8", closing: "Cierre" },
  };
}

function week(rotationKey: keyof typeof ROTATION_ORDER, emphasis = "Hipertrofia"): Week {
  const strength = /fuerza/i.test(emphasis);
  const order: Pattern[] = [...ROTATION_ORDER[rotationKey], "Full-body"];
  return {
    weekNumber: 28, block: 1, blockEmphasis: emphasis, phase: "Desarrollar",
    breathingTechnique: "Exhalación 1:2", rotationKey: rotationKey as Week["rotationKey"], isTestWeek: false,
    sessions: order.map((p, i) => session(i + 1, p, strength)),
  };
}
const rules = (w: Week) => lintWeekMethod(w).map((v) => v.rule);
const clone = (w: Week): Week => JSON.parse(JSON.stringify(w));

for (const key of Object.keys(ROTATION_ORDER) as (keyof typeof ROTATION_ORDER)[]) {
  const w = week(key);
  check(weekSchema.safeParse(w).success, `rotación ${key}: cumple el schema`);
  check(lintWeekMethod(w).length === 0, `rotación ${key}: pasa el linter del método`);
  check(lintWeekVariety(w).length === 0, `rotación ${key}: pasa el linter de variedad`);
}
check(lintWeekMethod(week("1-2", "Fuerza")).length === 0, "mesociclo de fuerza con sinergistas después del principal: pasa");

// Orden y separación: Bisagra y Jalón intercambiados con sus vecinos.
let w = week("1-2");
[w.sessions[2].pattern, w.sessions[3].pattern] = ["Rotación", "Unilateral"];
check(rules(w).includes("day-order"), "día fuera de la matriz: day-order");
w = week("1-2");
w.sessions[2].pattern = "Jalón";
check(rules(w).includes("separation"), "Bisagra martes y Jalón miércoles: separation");
w = week("5-6");
w.sessions[0].pattern = "Jalón";
check(rules(w).includes("separation"), "Bisagra viernes y Jalón lunes: separation");

// Primer: lo exige el schema.
const noPrimer = clone(week("1-2")) as unknown as { sessions: { fuerza: Record<string, unknown> }[] };
delete noPrimer.sessions[0].fuerza.powerPrimer;
check(!weekSchema.safeParse(noPrimer).success, "sesión sin primer de potencia: el schema la rechaza");

// Isométricos.
w = week("1-2");
w.sessions[0].fuerza.stations = w.sessions[0].fuerza.stations.filter((s) => s.kind !== "isométrico");
check(rules(w).includes("isometric-session"), "sesión sin isométrico: isometric-session");
w = week("1-2");
for (const s of w.sessions) for (const x of s.fuerza.stations) if (x.kind === "isométrico") x.region = "superior";
check(rules(w).includes("isometric-lower"), "sin isométrico de tren inferior: isometric-lower");

// Día de Rotación.
w = week("1-2");
w.sessions[3].fuerza.stations = [st("Tríceps", "neutro", "superior", "entre series"), st("Pallof sostenido", "isométrico", "core", "entre series")];
check(rules(w).includes("rotation-stations"), "Rotación con una sola estación de rotación: rotation-stations");

// Intervalo largo.
w = week("1-2");
w.sessions[2].acondicionamiento.zone = "Z3";
check(rules(w).includes("long-interval"), "semana sin intervalo largo: long-interval");
w = week("1-2");
w.sessions[0].acondicionamiento = { ...w.sessions[0].acondicionamiento, format: "Intervalos", zone: "Z4" };
check(rules(w).includes("long-interval"), "dos intervalos largos: long-interval");
w = week("1-2");
w.sessions[2].acondicionamiento = { ...w.sessions[2].acondicionamiento, format: "Estaciones", zone: "Z3" };
w.sessions[4].acondicionamiento = { ...w.sessions[4].acondicionamiento, format: "Intervalos", zone: "Z4" };
check(rules(w).includes("long-interval"), "intervalo largo en Jalón: long-interval");
w = week("7-8");
w.sessions[4].acondicionamiento = { ...w.sessions[4].acondicionamiento, format: "Estaciones", zone: "Z3" };
w.sessions[5].acondicionamiento = { ...w.sessions[5].acondicionamiento, format: "Intervalos", zone: "Z4" };
check(!rules(w).includes("long-interval"), "Unilateral en viernes, intervalo largo el sábado: pasa");
w = week("1-2");
w.phase = "Recuperar";
w.sessions[2].acondicionamiento.zone = "Z2";
check(!rules(w).includes("long-interval"), "semana Recuperar sin intervalo largo: pasa");

// Estaciones en mesociclo de fuerza.
w = week("1-2", "Fuerza");
w.sessions[0].fuerza.stations[0].placement = "entre series";
check(rules(w).includes("strength-stations"), "sinergista entre series en fuerza: strength-stations");
w = week("1-2", "Hipertrofia");
check(!rules(w).includes("strength-stations"), "sinergista entre series en hipertrofia: pasa");

// Semanas de test.
w = week("3-4");
w.phase = "Desafiar"; w.isTestWeek = true;
w.sessions[0].pattern = "Jalón";
check(!rules(w).some((r) => r === "day-order" || r === "separation" || r === "long-interval"), "Desafiar: no aplica matriz ni intervalo largo");
w = week("1-2");
w.phase = "Reevaluación"; w.rotationKey = "9"; w.isTestWeek = true;
for (const s of w.sessions) s.fuerza.stations = [];
check(lintWeekMethod(w).length === 0, "Reevaluación: el linter del método no aplica");

console.log(fails === 0 ? "\nTodo en orden." : `\n${fails} fallo(s).`);
process.exit(fails === 0 ? 0 : 1);
