/**
 * SRXFIT › Por validar — qué registros del socio salen en verde (validar sin
 * pensar) y cuáles en ámbar (revisar). Nada se valida solo: verde solo habilita
 * «Validar todos los verdes».
 *
 * Uso:  npx tsx scripts/test-validar.ts
 */
import { checkMeasurement, checkPr } from "../src/lib/self-log/plausibility";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const squat = (value: number, previousBest: number | null, bodyWeightKg: number | null = 80) =>
  checkPr({ test: "BACK_SQUAT_3RM", value, unit: "kg", previousBest, bodyWeightKg });

let r = squat(100, 92);
check("Sentadilla +8,7 % sobre su mejor marca → verde", r.green, r.note);
check("La nota muestra la diferencia", r.note.includes("+8 kg") && r.note.includes("8.7 %"), r.note);

r = squat(110, 92);
check("Sentadilla +19,6 % → revisar", !r.green && r.note.startsWith("Salto grande"), r.note);

r = squat(90, 92);
check("Marca por debajo de la mejor → verde (es creíble)", r.green, r.note);

r = squat(100, null);
check("Sin marca oficial anterior → revisar", !r.green && r.note === "Sin marca oficial anterior");

r = squat(230, 220, 80);
check("Sentadilla 2,9× el peso corporal → revisar aunque el salto sea chico", !r.green && r.note.includes("× su peso"), r.note);

r = squat(100, 95, null);
check("Sin peso oficial no se aplica el tope por peso", r.green, r.note);

const pulls = (value: number, previousBest: number | null) =>
  checkPr({ test: "PULL_UPS_MAX", value, unit: "reps", previousBest, bodyWeightKg: 70 });
check("Dominadas 4 → 8 (+4, bajo el mínimo de 5) → verde", pulls(8, 4).green, pulls(8, 4).note);
check("Dominadas 4 → 10 (+6) → revisar", !pulls(10, 4).green, pulls(10, 4).note);
check("Dominadas 20 → 25 (+25 %) → verde", pulls(25, 20).green, pulls(25, 20).note);
check("Más de 40 dominadas → revisar", !pulls(45, 40).green, pulls(45, 40).note);

const prev = { weightKg: 80, waistCm: 90 };
let m = checkMeasurement({ weightKg: 79, waistCm: 89 }, prev);
check("Peso −1 kg y cintura −1 cm → verde", m.green, m.lines.join(" | "));
check("Las líneas muestran el cambio", m.lines[0] === "Peso 79 kg (-1 kg)", m.lines[0]);

m = checkMeasurement({ weightKg: 72 }, prev);
check("Peso −8 kg (10 %) → revisar", !m.green && m.note.includes("Peso"), m.note);

m = checkMeasurement({ weightKg: 79, armCm: 35 }, prev);
check("Brazo sin medida previa no lo vuelve ámbar si el peso compara", m.green, m.note);

m = checkMeasurement({ armCm: 35 }, prev);
check("Nada que comparar → revisar", !m.green && m.note === "Sin medida oficial anterior", m.note);

m = checkMeasurement({ weightKg: 80 }, {});
check("Primera medida del socio → revisar", !m.green);

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : "\nTodo bien");
process.exit(fallos ? 1 : 0);
