/**
 * Pruebas de «Tu prescripción de hoy» (reglas 8.3 y 8.4 del Manual SRXFIT v3), sin base de datos.
 * npx tsx scripts/test-prescripcion.ts
 */
import { prescribe, profileFor, strengthDrop, type PrescriptionInput } from "../src/lib/srxfit/prescription";

let fails = 0;
const check = (ok: boolean, what: string, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✓" : "✗"} ${what}${detail ? ` — ${detail}` : ""}`);
};

// Socio estable: 2 años, Nivel 2, viene 3 días por semana.
const base: PrescriptionInput = {
  phase: "Desarrollar", sex: "MALE", age: 35, menopausal: null, level: 2, weeksTraining: 104,
  daysSinceLastVisit: 1, visitsLast14: 6, visitsLast21: 9, compositionGoal: false, mainSets: [],
};
const p = (over: Partial<PrescriptionInput>) => prescribe({ ...base, ...over });

// Perfiles (8.3).
check(profileFor({ sex: "FEMALE", age: 30, menopausal: null }) === "A", "mujer sin etapa registrada: A");
check(profileFor({ sex: "FEMALE", age: 47, menopausal: "PERI" }) === "B", "perimenopausia: B");
check(profileFor({ sex: "FEMALE", age: 55, menopausal: "POST" }) === "C", "posmenopausia: C");
check(profileFor({ sex: "MALE", age: 39, menopausal: null }) === "D", "hombre menor de 40: D");
check(profileFor({ sex: "MALE", age: 52, menopausal: null }) === "E", "hombre 40–59: E");
check(profileFor({ sex: "FEMALE", age: 63, menopausal: "POST" }) === "F", "60 o más: F aunque sea posmenopausia");
check(profileFor({ sex: null, age: null, menopausal: null }) === null, "sin datos: sin perfil");

// Base.
check(p({}).step === "base" && p({}).rule === null, "socio estable: base de la clase");
check(p({}).priorities.length === 0, "perfil D: sin prioridades extra");

// Reglas de bajada.
check(p({ weeksTraining: 5 }).rule === 1 && p({ weeksTraining: 5 }).step === "down", "menos de 8 semanas: regla 1");
check(p({ level: 1 }).rule === 1, "Nivel 1: regla 1");
check(p({ daysSinceLastVisit: 9, visitsLast14: 2 }).rule === 2, "vuelve tras 9 días: regla 2");
check(p({ visitsLast14: 3 }).rule === 2, "menos de 2 veces por semana: regla 2");
check(p({ daysSinceLastVisit: null, visitsLast14: 0, weeksTraining: 0 }).rule === 1, "socio nuevo sin visitas: regla 1, no regla 2");
const dropping = [
  { exercise: "Front squat", loadKg: 80, reps: 5, rir: 0, daysAgo: 2 },
  { exercise: "front squat", loadKg: 80, reps: 5, rir: 1, daysAgo: 9 },
  { exercise: "Front squat", loadKg: 80, reps: 5, rir: 2, daysAgo: 16 },
];
check(strengthDrop(dropping) === "Front squat", "1RM estimado baja dos veces con la misma carga");
check(p({ mainSets: dropping }).rule === 5, "caída de fuerza: regla 5");
check(strengthDrop([{ ...dropping[0], loadKg: 85 }, dropping[1], dropping[2]]) === null, "cambió la carga: no aplica");
check(strengthDrop(dropping.map((s) => ({ ...s, daysAgo: s.daysAgo + 10 }))) === null, "último registro hace más de una semana: no aplica");
check(strengthDrop(dropping.slice(0, 2)) === null, "menos de tres registros: no aplica");
const two = p({ weeksTraining: 5, daysSinceLastVisit: 10 });
check(two.rule === 1 && two.reasons.length === 2, "dos reglas de bajada: un solo paso, dos motivos");

// Reglas de subida.
const c = { sex: "FEMALE" as const, age: 56, menopausal: "POST" as const };
check(p(c).rule === 6 && p(c).step === "up", "perfil C con 3 días: regla 6");
check(p({ ...c, visitsLast14: 4 }).step === "base", "perfil C con 2 días: base");
check(p({ ...c, weeksTraining: 4 }).step === "down", "perfil C pero nueva: gana la bajada");
check(p({ compositionGoal: true }).rule === 7, "composición + 3 días + más de 6 meses: regla 7");
check(p({ compositionGoal: true, weeksTraining: 20 }).step === "base", "composición con menos de 6 meses: base");
check(p(c).priorities.length > 0, "perfil C: muestra prioridades");
check(p({ age: 52 }).priorities.length === 2 && p({ age: 45 }).priorities.length === 1, "perfil E: impacto y equilibrio desde los 50");

// Semana Recuperar (regla 8 y 9.2).
check(p({ phase: "Recuperar" }).step === "half" && p({ phase: "Recuperar" }).rule === 8, "Recuperar con carga acumulada: mitad de series");
check(p({ phase: "Recuperar", ...c }).step === "half", "Recuperar gana a la subida");
const light = p({ phase: "Recuperar", visitsLast21: 4, visitsLast14: 4 });
check(light.step === "base" && light.reasons.length === 1, "Recuperar pero vino poco: mantiene sus series");
check(p({ phase: "Recuperar", visitsLast21: 3, visitsLast14: 2 }).rule === 2, "Recuperar, vino poco y con baja frecuencia: regla 2");

console.log(fails === 0 ? "\nTodo en orden." : `\n${fails} fallo(s).`);
process.exit(fails === 0 ? 0 : 1);
