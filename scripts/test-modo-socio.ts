/**
 * Prueba del "modo socio" del agente de WhatsApp (16 oct 2026).
 *
 * Lo que protege:
 *  - Lesiones, cobros/pagos y reclamos los atiende SIEMPRE una persona, aunque
 *    el modelo se anime a contestar (guarda en código, como con Ibeth).
 *  - Quién es socio: el de la conversación o el que llegó como lead y se inscribió.
 *    Antes, a ese último el bot le ofrecía las dos semanas por $9.
 *  - El modo viene apagado: mergear no cambia nada hasta prender WHATSAPP_AGENT_SOCIOS.
 *
 * Pura (no toca BD ni WhatsApp):  npx tsx scripts/test-modo-socio.ts
 * Con ANTHROPIC_API_KEY y --en-vivo, además le pide respuestas reales al modelo
 * (no envía nada) y revisa que cumplan las reglas.
 */

import { memberHandoffReply, memberNeedsPerson } from "../src/lib/whatsapp/guards";
import { memberModeEnabled, socioOf, type SocioRef } from "../src/lib/whatsapp/member-mode";
import { MEMBER_SYSTEM_PROMPT, memberContextBlock, normalizeRegistro, runMemberAgent } from "../src/lib/whatsapp/agent";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${!ok && detalle ? `\n   ${detalle}` : ""}`);
}

// ── Guarda: temas que ve una persona ────────────────────────────────────────
console.log("Temas que pasan a una persona:");
const temas: Array<[string, ReturnType<typeof memberNeedsPerson>]> = [
  ["Me lesioné la rodilla el sábado", "lesion"],
  ["me duele mucho la espalda desde el martes", "lesion"],
  ["tengo un esguince en el tobillo", "lesion"],
  ["Me van a operar del hombro", "lesion"],
  ["Ya pagué la mensualidad por transferencia, ¿la registraron?", "cobro"],
  ["Me cobraron dos veces este mes", "cobro"],
  ["¿Cuánto cuesta renovar por tres meses?", "cobro"],
  ["Necesito la factura de octubre", "cobro"],
  ["Quiero congelar mi plan porque viajo", "cobro"],
  ["Quiero poner una queja del coach de la mañana", "reclamo"],
  ["Pésimo el trato de ayer en recepción", "reclamo"],
  ["Estoy muy molesta con lo que pasó", "reclamo"],
  // Lo que NO debe disparar
  ["Hola! esta semana no pude ir por el trabajo", null],
  ["Me cambiaron de horario en la oficina", null],
  ["¿A qué hora es la clase de la tarde?", null],
  ["Vuelvo el lunes, ya estoy mejor", null],
  ["Me da pereza, no sé qué me pasa", null],
  ["¿Puedo pagar en recepción mañana?", "cobro"],
];
for (const [texto, esperado] of temas) {
  const real = memberNeedsPerson([texto]);
  check(`"${texto}" → ${esperado ?? "agente"}`, real === esperado, `obtuvo ${real}`);
}
check("mira toda la ráfaga, no solo el último mensaje", memberNeedsPerson(["hola", "me lastimé el pie", "¿qué hago?"]) === "lesion");

// ── Respuestas fijas del handoff ────────────────────────────────────────────
console.log("\nRespuestas del handoff:");
for (const r of ["lesion", "cobro", "reclamo", "persona", "no_se"] as const) {
  const t = memberHandoffReply(r, "Diego");
  check(`${r}: "${t}"`, t.includes("Diego") && !/\$9|dos semanas/.test(t) && normalizeRegistro(t) === t);
}
check("lesión: nunca diagnostica ni manda reposo", !/repos|hielo|estira|ejercicio/i.test(memberHandoffReply("lesion", null)));

// ── Quién es socio ──────────────────────────────────────────────────────────
console.log("\nQuién es socio:");
const m = (status: SocioRef["status"]): SocioRef => ({ id: "m1", firstName: "Ana", lastName: "Paz", sede: "XTREME", status, joinedAt: new Date("2026-01-01") });
check("conversación del socio, ACTIVE → socio", socioOf({ member: m("ACTIVE"), lead: null })?.id === "m1");
check("conversación del lead que se inscribió → socio (antes le vendían los $9)", socioOf({ member: null, lead: { member: m("ACTIVE") } })?.id === "m1");
check("socio en pausa → socio", socioOf({ member: m("PAUSED"), lead: null }) !== null);
check("en su trial de $9 → no (lo cierra el agente de ventas)", socioOf({ member: null, lead: { member: m("TRIAL") } }) === null);
check("ex socio (CHURNED) → no", socioOf({ member: m("CHURNED"), lead: null }) === null);
check("lead sin ficha de socio → no", socioOf({ member: null, lead: { member: null } }) === null);
const prev = process.env.WHATSAPP_AGENT_SOCIOS;
delete process.env.WHATSAPP_AGENT_SOCIOS;
check("apagado por defecto (sin WHATSAPP_AGENT_SOCIOS)", memberModeEnabled() === false);
process.env.WHATSAPP_AGENT_SOCIOS = "true";
check("se prende solo con WHATSAPP_AGENT_SOCIOS=true", memberModeEnabled() === true);
if (prev === undefined) delete process.env.WHATSAPP_AGENT_SOCIOS; else process.env.WHATSAPP_AGENT_SOCIOS = prev;

// ── Lo que ve el modelo ─────────────────────────────────────────────────────
console.log("\nPrompt y contexto:");
check("el prompt prohíbe la oferta de $9 a socios", MEMBER_SYSTEM_PROMPT.includes("NUNCA le ofrezcas las dos semanas por $9"));
check("el prompt cierra con ¿qué día vuelves?", MEMBER_SYSTEM_PROMPT.includes("¿Qué día vuelves?"));
check("el prompt trae las causas y soluciones (horario, rutina corta, coach, nutricionista, pausa)", ["horario", "sesión más corta", "coach", "nutricionista", "pausar"].every((t) => MEMBER_SYSTEM_PROMPT.includes(t)));
check("el prompt manda lesión / cobro / reclamo a una persona", ["lesion", "cobro", "reclamo"].every((t) => MEMBER_SYSTEM_PROMPT.includes(`handoffReason="${t}"`)));
check("el prompt hereda el registro (sin voseo, chévere)", MEMBER_SYSTEM_PROMPT.includes("NUNCA vosea") && MEMBER_SYSTEM_PROMPT.includes("chévere"));
const ctx = memberContextBlock({ firstName: "Diego", sede: "FITNESS_CENTER", daysSinceLastVisit: 6, rhythm: "L-X-V (3/sem)" }, new Date("2026-10-16T15:00:00Z"));
check("contexto: días sin venir y ritmo", ctx.includes("hace 6 días") && ctx.includes("L-X-V (3/sem)"));
check("contexto: los turnos de SU sede (para ofrecer otro horario)", ctx.includes("5:30, 6:30, 7:30, 8:30") && !ctx.includes("6:00, 7:00"));

async function enVivo() {
  if (!process.argv.includes("--en-vivo")) return;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("\n(--en-vivo omitido: falta ANTHROPIC_API_KEY)");
    return;
  }
  console.log("\nEn vivo (el modelo responde; nada se envía):");
  const ctxBase = { firstName: "Diego", sede: "XTREME" as const, daysSinceLastVisit: 6, rhythm: "L-X-V (3/sem)" };
  const casos: Array<{ socio: string; handoff: boolean }> = [
    { socio: "Hola, sí, es que me cambiaron el horario en el trabajo y ya no alcanzo a las 6", handoff: false },
    { socio: "La verdad no veo resultados, llevo meses igual", handoff: false },
    { socio: "Estoy de viaje hasta el 25", handoff: false },
    { socio: "Me lesioné el hombro haciendo press", handoff: true },
    { socio: "¿Cuándo se me vence el plan?", handoff: true },
  ];
  for (const c of casos) {
    const r = await runMemberAgent([{ role: "assistant", text: "¡Hola Diego! 👋 Llevas 6 días sin venir a entrenar a La Cueva. Te extrañamos." }, { role: "user", text: c.socio }], ctxBase);
    console.log(`\n👤 ${c.socio}\n🤖 ${r.reply}\n   causa=${r.causa} handoff=${r.handoff} (${r.handoffReason}) vuelve=${r.vuelve}`);
    check("sin $9 ni precio de mensualidad", !/\$\s?9\b|\$60|\$50|\$40/.test(r.reply));
    check(`handoff=${c.handoff}`, r.handoff === c.handoff || memberNeedsPerson([c.socio]) !== null);
    if (!c.handoff) check("termina en pregunta", r.reply.trim().endsWith("?") || /\?\s*\S{0,3}$/u.test(r.reply.trim()));
  }
}

enVivo().then(() => {
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
  process.exit(fallos ? 1 : 0);
});
