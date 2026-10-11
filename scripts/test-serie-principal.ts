/**
 * Pruebas del registro de la serie principal (sin base de datos).
 * npx tsx scripts/test-serie-principal.ts
 */
import { checkMainSet, estimate1Rm, exerciseKey, formatMainSet, mainExerciseFromMd, validateMainSet } from "../src/lib/self-log/main-set";

let fails = 0;
const check = (ok: boolean, what: string, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✓" : "✗"} ${what}${detail ? ` — ${detail}` : ""}`);
};

// 1RM estimado: Epley con las reps en reserva como reps posibles.
check(estimate1Rm({ loadKg: 100, reps: 1, rir: 0 }) === 100, "1 rep al máximo = la carga");
check(estimate1Rm({ loadKg: 100, reps: 5, rir: 0 }) === 116.7, "100 × 5 al fallo ≈ 116,7", String(estimate1Rm({ loadKg: 100, reps: 5, rir: 0 })));
check(estimate1Rm({ loadKg: 100, reps: 3, rir: 2 }) === estimate1Rm({ loadKg: 100, reps: 5, rir: 0 }), "3 reps con 2 en reserva = 5 al fallo");
check(estimate1Rm({ loadKg: 60, reps: 8, rir: 2 }) === 80, "60 × 8 con 2 en reserva = 80");

check(exerciseKey("  Front   Squat ") === exerciseKey("front squat"), "el ejercicio se compara sin mayúsculas ni espacios de más");
check(formatMainSet({ loadKg: 62.5, reps: 8, rir: 2 }) === "62.5 kg × 8 · 2 en reserva", "formato de la serie");
check(mainExerciseFromMd("# Fuerza (25 min)\n\n**Ejercicio principal:** Front squat\nEsquema: 5 × 5") === "Front squat", "lee el principal del bloque de Fuerza");
check(mainExerciseFromMd("**Circuito**") === null, "sin principal en el bloque: null");

// Validación del formulario.
check(validateMainSet({ exercise: "Front squat", loadKg: 60, reps: 8, rir: 2 }).ok, "serie válida");
check(!validateMainSet({ exercise: "", loadKg: 60, reps: 8, rir: 2 }).ok, "sin ejercicio: rechaza");
check(!validateMainSet({ exercise: "Front squat", loadKg: 0, reps: 8, rir: 2 }).ok, "carga 0: rechaza");
check(!validateMainSet({ exercise: "Front squat", loadKg: 60, reps: 8.5, rir: 2 }).ok, "reps con decimales: rechaza");
check(!validateMainSet({ exercise: "Front squat", loadKg: 60, reps: 8, rir: 9 }).ok, "9 en reserva: rechaza");
check(!validateMainSet({ exercise: "Front squat", loadKg: 60, reps: 8, rir: null }).ok, "sin reps en reserva: rechaza");

// Verde o revisar.
const set = { loadKg: 60, reps: 8, rir: 2 }; // e1RM 80
check(!checkMainSet({ ...set, previousBestE1Rm: null, bodyWeightKg: 70 }).green, "sin registro oficial anterior: revisar");
check(checkMainSet({ ...set, previousBestE1Rm: 78, bodyWeightKg: 70 }).green, "+2 kg sobre 78: verde");
check(checkMainSet({ ...set, previousBestE1Rm: 85, bodyWeightKg: 70 }).green, "por debajo de su mejor: verde");
check(!checkMainSet({ ...set, previousBestE1Rm: 65, bodyWeightKg: 70 }).green, "+15 kg sobre 65 (+23 %): revisar");
check(!checkMainSet({ loadKg: 230, reps: 3, rir: 1, previousBestE1Rm: 260, bodyWeightKg: 70 }).green, "más de 3× su peso corporal: revisar");

console.log(fails === 0 ? "\nTodo en orden." : `\n${fails} fallo(s).`);
process.exit(fails === 0 ? 0 : 1);
