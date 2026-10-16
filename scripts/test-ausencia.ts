/**
 * Prueba de la regla del aviso AUSENCIA (src/lib/whatsapp/absence-rhythm.ts).
 *
 * Lo que protege (Santiago, 16 oct 2026): el aviso sale cuando el socio pierde
 * 2 sesiones de SU ritmo, no a los "N días" para todos. Con la regla vieja (al
 * tercer día sin venir) a quien viene L-M-V le saltaba casi cada semana sin
 * haber faltado a nada.
 *
 * Pura: no toca la BD ni WhatsApp.  Uso:  npx tsx scripts/test-ausencia.ts
 */

import { absenceDecision, describeRhythm, memberRhythm } from "../src/lib/whatsapp/absence-rhythm";
import { addDays } from "../src/lib/nutrition/appointments";
import { weekdayOf } from "../src/lib/nutrition/slots";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${!ok && detalle ? `\n   ${detalle}` : ""}`);
}

/** Visit days on these weekdays (1 = lunes … 6 = sábado) for 4 weeks ending on `last`. */
function weekly(weekdays: number[], last: string, weeks = 4): string[] {
  const out: string[] = [];
  for (let d = addDays(last, -(weeks * 7 - 1)); d <= last; d = addDays(d, 1)) if (weekdays.includes(weekdayOf(d))) out.push(d);
  return out;
}

// Octubre 2026: el lunes es el 12, el viernes el 16.
const LV = [1, 2, 3, 4, 5];
const LXV = [1, 3, 5];
const MJ = [2, 4];
const JOINED_LONG_AGO = "2026-01-10";
/** 10 visitas en 4 semanas, repartidas sin días fijos (y algún sábado). */
const IRREGULAR = ["2026-09-08", "2026-09-11", "2026-09-14", "2026-09-17", "2026-09-19", "2026-09-23", "2026-09-25", "2026-09-29", "2026-10-02", "2026-10-05"];

const casos: Array<{ nombre: string; visitas: string[]; joined?: string; hoy: string; due: boolean; missed?: number }> = [
  // A diario (L–V): 2 días hábiles seguidos
  { nombre: "a diario, vino el viernes 9 → el lunes 12 no (sábado y domingo no son sus días)", visitas: weekly(LV, "2026-10-09"), hoy: "2026-10-12", due: false, missed: 0 },
  { nombre: "a diario, faltó el lunes → el martes 13 todavía no", visitas: weekly(LV, "2026-10-09"), hoy: "2026-10-13", due: false, missed: 1 },
  { nombre: "a diario, faltó lunes y martes → el miércoles 14 sí", visitas: weekly(LV, "2026-10-09"), hoy: "2026-10-14", due: true, missed: 2 },
  { nombre: "a diario, vino el lunes 12, faltó martes y miércoles → el jueves 15 sí", visitas: weekly(LV, "2026-10-12"), hoy: "2026-10-15", due: true, missed: 2 },

  // L-M-V (3 por semana): 2 de SUS días
  { nombre: "L-X-V, vino el viernes 9 → el martes 13 no (solo faltó el lunes)", visitas: weekly(LXV, "2026-10-09"), hoy: "2026-10-13", due: false, missed: 1 },
  { nombre: "L-X-V → el miércoles 14 tampoco (el miércoles de hoy aún no se pierde)", visitas: weekly(LXV, "2026-10-09"), hoy: "2026-10-14", due: false, missed: 1 },
  { nombre: "L-X-V, faltó lunes y miércoles → el jueves 15 sí", visitas: weekly(LXV, "2026-10-09"), hoy: "2026-10-15", due: true, missed: 2 },
  { nombre: "L-X-V con dos días sin venir (sábado y lunes, como la regla vieja) → no", visitas: weekly(LXV, "2026-10-09"), hoy: "2026-10-13", due: false },
  { nombre: "L-X-V, vino el lunes 12 → el viernes 16 no (solo faltó el miércoles)", visitas: weekly(LXV, "2026-10-12"), hoy: "2026-10-16", due: false, missed: 1 },

  // Dos por semana: tarda más, pero no más de lo que dicen sus días
  { nombre: "M-J, vino el jueves 8 → el jueves 15 no (solo el martes perdido)", visitas: weekly(MJ, "2026-10-08"), hoy: "2026-10-15", due: false, missed: 1 },
  { nombre: "M-J, faltó martes y jueves → el viernes 16 sí", visitas: weekly(MJ, "2026-10-08"), hoy: "2026-10-16", due: true, missed: 2 },

  // Con sábado entre sus días
  { nombre: "L-X-S, vino el miércoles 7, faltó sábado 10 y lunes 12 → el martes 13 sí", visitas: weekly([1, 3, 6], "2026-10-07"), hoy: "2026-10-13", due: true, missed: 2 },

  // Piso para socios nuevos: como si vinieran 3 por semana (4 días hábiles)
  { nombre: "nuevo (entró el 1 oct), vino el viernes 9 → el miércoles 14 no (2 días hábiles)", visitas: ["2026-10-02", "2026-10-05", "2026-10-07", "2026-10-09"], joined: "2026-10-01", hoy: "2026-10-14", due: false },
  { nombre: "nuevo → el jueves 15 sí (3 días hábiles ≈ 2 sesiones de 3 por semana)", visitas: ["2026-10-02", "2026-10-05", "2026-10-07", "2026-10-09"], joined: "2026-10-01", hoy: "2026-10-15", due: true },

  // Casi a diario (≈4,5 por semana): dos días hábiles ya son ~2 sesiones
  { nombre: "casi a diario (18 de 20 días), faltó lunes y martes → el miércoles 14 sí", visitas: weekly(LV, "2026-10-09").filter((d) => d !== "2026-09-15" && d !== "2026-09-30"), hoy: "2026-10-14", due: true },

  // Más días habituales que sesiones (como Mayte en la corrida del 16 oct)
  { nombre: "1,5/sem en sus días L-X (no viene a todos), vino el lunes 12 → el jueves 15 no (un día suyo perdido)", visitas: ["2026-09-21", "2026-09-23", "2026-09-29", "2026-10-05", "2026-10-07", "2026-10-12"], hoy: "2026-10-15", due: false },
  { nombre: "el mismo → el martes 20 sí (miércoles y lunes, ≈ 1,5 sesiones esperadas → 2)", visitas: ["2026-09-21", "2026-09-23", "2026-09-29", "2026-10-05", "2026-10-07", "2026-10-12"], hoy: "2026-10-20", due: true },

  // Sin avisos atrasados: el aviso es para el momento, no para ponerse al día
  { nombre: "a diario y ya van 5 días hábiles → no (habría salido el miércoles; lo ven las tareas)", visitas: weekly(LV, "2026-10-09"), hoy: "2026-10-16", due: false },
  { nombre: "a diario, 3 días hábiles (el cron se saltó un día) → todavía sí", visitas: weekly(LV, "2026-10-09"), hoy: "2026-10-15", due: true },

  // Poco frecuente: no "venía seguido" → no hay aviso de ausencia
  { nombre: "4 visitas en 4 semanas (1 por semana) → nunca", visitas: ["2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"], hoy: "2026-10-16", due: false },

  // Irregular sin días fijos: por su tasa, y nunca más de una semana
  {
    nombre: "≈2,5 por semana sin días fijos, vino el lunes 5 → el lunes 12 sí (5 días de entrenamiento × 2,5/6)",
    visitas: IRREGULAR,
    hoy: "2026-10-12", due: true,
  },
  {
    nombre: "el mismo irregular → el jueves 8 no (3 días hábiles)",
    visitas: IRREGULAR,
    hoy: "2026-10-08", due: false,
  },

  // Bordes
  { nombre: "vino hoy → no", visitas: [...weekly(LV, "2026-10-09"), "2026-10-14"], hoy: "2026-10-14", due: false },
  { nombre: "más de 10 días sin venir → ya no (es de las tareas del staff)", visitas: weekly(LV, "2026-10-02"), hoy: "2026-10-16", due: false },
  { nombre: "sin asistencias → no", visitas: [], hoy: "2026-10-16", due: false },
  { nombre: "dos visitas el mismo día cuentan como una", visitas: [...weekly(LXV, "2026-10-09"), ...weekly(LXV, "2026-10-09")], hoy: "2026-10-15", due: true, missed: 2 },
];

for (const c of casos) {
  const r = absenceDecision(c.visitas, c.joined ?? JOINED_LONG_AGO, c.hoy);
  const ok = r.due === c.due && (c.missed === undefined || r.missed === c.missed);
  check(c.nombre, ok, `due=${r.due} missed=${r.missed} · ${r.why}`);
}

// El ritmo que se lee
console.log("\nRitmo:");
const ritmo = (v: string[], j = JOINED_LONG_AGO) => { const r = memberRhythm(v, j); return r ? describeRhythm(r) : "—"; };
check(`a diario → "${ritmo(weekly(LV, "2026-10-09"))}"`, ritmo(weekly(LV, "2026-10-09")) === "L-M-X-J-V (5/sem)");
check(`L-X-V → "${ritmo(weekly(LXV, "2026-10-09"))}"`, ritmo(weekly(LXV, "2026-10-09")) === "L-X-V (3/sem)");
check("el ritmo se mide en las 4 semanas hasta su última visita, no hasta hoy", memberRhythm(weekly(LV, "2026-10-09"), JOINED_LONG_AGO)?.perWeek === 5);
check("una visita de domingo no cuenta", ritmo([...weekly(LXV, "2026-10-09"), "2026-10-04"]) === "L-X-V (3/sem)");
check(`irregular → "${ritmo(IRREGULAR)}"`, memberRhythm(IRREGULAR, JOINED_LONG_AGO)?.kind === "RATE");
check("socio de 10 días → nuevo", memberRhythm(["2026-10-05", "2026-10-07"], "2026-09-28")?.kind === "DEFAULT");

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
process.exit(fallos ? 1 : 0);
