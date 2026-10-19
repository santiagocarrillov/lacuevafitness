/**
 * Prueba de los ajustes a la cadencia de seguimiento (corte del 19 oct 2026),
 * sin llamar al modelo ni tocar la base:
 *
 *  1. «Posponer a fecha»: la fecha que devuelve el agente se valida en hora de
 *     Ecuador y deja UNA tarea de WhatsApp para la sede del lead (caso Marizol:
 *     «tengo pagado otro gym hasta el 5 de noviembre»).
 *  2. El toque de ~22 h trae motivos distintos según la conversación, y un
 *     borrador con la fórmula gastada («¿Sería muy loco…?», «llegar y sufrir»)
 *     se rechaza. «health app» se vuelve «app».
 *  3. Ningún toque pregunta «¿Fitness o Xtreme?» a quien no conoce las sedes.
 *
 * Lo que escribe el modelo de verdad se ve con `npm run test:seguimientos`
 * (necesita ANTHROPIC_API_KEY).
 *
 * Uso:  npm run test:cadencia
 */

import {
  followupInstruction,
  NUDGE_ANGLES,
  normalizeRegistro,
  nudgeIssues,
  pickNudgeAngle,
  SYSTEM_PROMPT,
  type NudgeAngle,
} from "../src/lib/whatsapp/agent";
import { parsePostponeDate, postponeTaskPlan, POSTPONE_MAX_DAYS } from "../src/lib/whatsapp/postpone";

let fallos = 0;
function check(ok: boolean, label: string, detail?: string) {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok && detail) console.log(`   ${detail}`);
}
const ec = (iso: string) => new Date(`${iso}-05:00`);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "null");

// ── 1. Posponer a fecha ─────────────────────────────────────────────────────
console.log("Posponer a fecha (hoy = 19 oct 2026, 15:00 en Ecuador):");
const now = ec("2026-10-19T15:00");
const fechas: Array<[string | null, string, string]> = [
  ["2026-11-05", "2026-11-05", "Marizol: «tengo pagado hasta el 5 de noviembre»"],
  ["2026-10-20", "2026-10-20", "mañana ya cuenta"],
  ["2026-10-19", "null", "hoy no es posponer: es contestar"],
  ["2026-10-01", "null", "una fecha pasada no frena la cadencia"],
  ["2026-02-30", "null", "un día que no existe"],
  ["5 de noviembre", "null", "texto libre: el agente debe dar YYYY-MM-DD"],
  [null, "null", "sin fecha: la cadencia sigue"],
  ["2027-12-01", day(new Date(Date.UTC(2026, 9, 19) + POSTPONE_MAX_DAYS * 86_400_000)), `más de ${POSTPONE_MAX_DAYS} días: se trae al horizonte`],
];
for (const [entrada, esperado, porque] of fechas) {
  const real = day(parsePostponeDate(entrada, now));
  check(real === esperado, `${entrada ?? "null"} → ${real}  · ${porque}`, `esperaba ${esperado}`);
}
// 23:30 en Ecuador ya es el día siguiente en UTC (Vercel): "mañana" sigue siendo el 20.
const noche = ec("2026-10-19T23:30");
check(day(parsePostponeDate("2026-10-20", noche)) === "2026-10-20", "a las 23:30 EC, el 20 sigue siendo mañana (no se confunde con UTC)");
check(parsePostponeDate("2026-10-19", noche) === null, "a las 23:30 EC, el 19 sigue siendo hoy");

const plan = postponeTaskPlan(
  { id: "lead_marizol", firstName: "Marizol", lastName: null, sede: "XTREME" },
  new Date(Date.UTC(2026, 10, 5)),
  "Tengo pagado otro gym hasta el 5 de noviembre, mejor me escribe",
);
check(plan.type === "WHATSAPP" && plan.sede === "XTREME" && plan.leadId === "lead_marizol", "la tarea es de WhatsApp, para la sede del lead y enlazada a su ficha");
check(plan.autoKey === "lead-posponer:lead_marizol:2026-11-05", "autoKey por lead y fecha: un reintento no la duplica", plan.autoKey);
check(day(plan.dueDate) === "2026-11-05", "vence el día que pidió");
check(/Marizol/.test(plan.title) && /5 nov/.test(plan.title), "el título dice a quién y cuándo", plan.title);
check(plan.detail.includes("Tengo pagado otro gym"), "el detalle trae lo que dijo el lead");
check(!("assigneeId" in plan), "sin asignar, como las tareas automáticas (cae en el pozo de la sede)");

// ── 2. Variedad en el toque de ~22 h ────────────────────────────────────────
console.log("\nToque de ~22 h:");
const angles = Object.keys(NUDGE_ANGLES) as NudgeAngle[];
check(pickNudgeAngle("cmg1abc") === pickNudgeAngle("cmg1abc"), "el motivo es estable por conversación (un reintento no lo cambia)");
const counts = Object.fromEntries(angles.map((a) => [a, 0])) as Record<NudgeAngle, number>;
for (let i = 0; i < 400; i++) counts[pickNudgeAngle(`cm${(i * 7919).toString(36)}x${i}`)]++;
const minShare = Math.min(...angles.map((a) => counts[a])) / 400;
check(minShare >= 0.15, `los motivos se reparten entre leads (${angles.map((a) => `${a} ${counts[a]}`).join(" · ")})`);

for (const angle of angles) {
  const ins = followupInstruction({ step: 2, hoursSilent: 20, angle });
  check(ins.includes(NUDGE_ANGLES[angle]), `la instrucción lleva el motivo «${angle}»`);
}
const ins2 = followupInstruction({ step: 2, hoursSilent: 20, angle: "horario" });
check(!/health app/i.test(ins2), "la instrucción no menciona «health app»");
check(!ins2.includes("¿Sería muy loco arrancar"), "la instrucción ya no trae el ejemplo que el modelo copiaba");
check(/contactarDesde/.test(ins2), "si el lead pidió otra fecha, el seguimiento la devuelve en vez de escribir");
const retry = followupInstruction({ step: 2, hoursSilent: 20, angle: "oferta", avoid: ["usaste la fórmula «¿Sería muy loco…?»"] });
check(retry.includes("Tu borrador anterior no sirvió porque usaste la fórmula"), "el reintento le dice qué corregir");

// Borradores reales del molde del 19 oct, y uno bueno.
const molde =
  "¡Hola Andrea! Te cuento que además tenemos nutricionista de planta y una health app donde ves tu progreso. Nada de llegar y sufrir 💪 ¿Sería muy loco arrancar esta semana?";
const issues = nudgeIssues(normalizeRegistro(molde), 2);
check(issues.some((i) => i.includes("Sería muy loco")), "rechaza «¿Sería muy loco…?»");
check(issues.some((i) => i.includes("llegar y sufrir")), "rechaza «llegar y sufrir»");
check(!/health app/i.test(normalizeRegistro(molde)) && normalizeRegistro(molde).includes("una app donde"), "«health app» sale como «app»");
check(normalizeRegistro("Health App") === "App", "respeta mayúsculas: «Health App» → «App»");
const bueno = "¡Hola Andrea! ¿Te guardo el miércoles a las 6:30 o a las 7:30 para arrancar tus dos semanas?";
check(nudgeIssues(bueno, 2).length === 0, "un toque con día y hora concretos pasa");

// ── 3. Sede: por sector, no por nombre ──────────────────────────────────────
console.log("\nSede:");
const sedeQ = "¡Hola Diego! Para pasarte los horarios, ¿te queda mejor Fitness o Xtreme?";
check(nudgeIssues(sedeQ, 1).length > 0, "rechaza «¿Fitness o Xtreme?» en el toque de +3 h");
check(nudgeIssues("¡Hola Diego! ¿Por qué sector vives o te mueves más? Así te digo cuál te queda más a mano.", 1).length === 0, "preguntar por el sector pasa");
const ins1 = followupInstruction({ step: 1, hoursSilent: 3 });
check(/sector/.test(ins1) && /nunca le preguntes/.test(ins1), "la instrucción del +3 h pide preguntar por el sector");
check(/NUNCA preguntes "¿Fitness o Xtreme\?"/.test(SYSTEM_PROMPT), "el prompt general tampoco lo pregunta");
check(/Elegir la sede \(la eliges tú/.test(SYSTEM_PROMPT), "el prompt explica cómo elige la sede el agente");
check(/contactarDesde/.test(SYSTEM_PROMPT), "el prompt explica cuándo devolver contactarDesde");
check(!/una health app/i.test(SYSTEM_PROMPT), "el prompt ya no vende la «health app»");

console.log(fallos === 0 ? "\n✅ Todo correcto (posponer, variedad y sede)" : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
