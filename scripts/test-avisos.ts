/**
 * Avisos automáticos por WhatsApp a socios.
 *  A. Puro: días de entrenamiento sin contar domingos; botón URL en la plantilla.
 *  B. Producción en modo prueba (dryRun): a quién le escribiría hoy cada aviso. No envía nada.
 *
 * Uso:  npx tsx --env-file=.env scripts/test-avisos.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { NOTICE_KINDS, planNotices, runNotices, trainingDaysBetween } from "../src/lib/whatsapp/member-notices";
import { sendTemplate } from "../src/lib/whatsapp/client";
import { TEMPLATE_CATALOG } from "../src/lib/whatsapp/template-catalog";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

async function partA() {
  console.log("\n── A. Reglas puras");
  check("vino el viernes 2 oct; el lunes 5 van 2 días (sábado y lunes, sin domingo)", trainingDaysBetween("2026-10-02", "2026-10-05") === 2);
  check("vino el jueves 1; el sábado 3 van 2 días", trainingDaysBetween("2026-10-01", "2026-10-03") === 2);
  check("vino el jueves 1; el lunes 5 van 3 días → toca aviso", trainingDaysBetween("2026-10-01", "2026-10-05") === 3);
  check("cada aviso automático tiene su plantilla en el catálogo", NOTICE_KINDS.every((k) => TEMPLATE_CATALOG.some((t) => t.name === k.template)));

  // The template payload with the booking button (fetch mocked: nothing leaves).
  const realFetch = globalThis.fetch;
  const prevToken = process.env.WHATSAPP_TOKEN, prevPhone = process.env.WHATSAPP_PHONE_ID;
  process.env.WHATSAPP_TOKEN = "test"; process.env.WHATSAPP_PHONE_ID = "123";
  let body: { template?: { components?: { type: string; sub_type?: string; parameters: { text?: string }[] }[] } } = {};
  globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
    body = JSON.parse(init?.body ?? "{}");
    return new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), { status: 200 });
  }) as typeof fetch;
  try {
    await sendTemplate("593999999999", "nutricion_agenda_cita", "es", ["Andrea"], [], "k3m9q2abcd");
  } finally {
    globalThis.fetch = realFetch;
    process.env.WHATSAPP_TOKEN = prevToken; process.env.WHATSAPP_PHONE_ID = prevPhone;
  }
  const btn = body.template?.components?.find((c) => c.type === "button");
  check("la plantilla lleva el código en el botón URL", btn?.sub_type === "url" && btn.parameters[0]?.text === "k3m9q2abcd", JSON.stringify(btn));
}

async function partB() {
  console.log("\n── B. Hoy en producción (modo prueba, no envía)");
  const before = await prisma.memberNotice.count();
  const plans = await planNotices();
  for (const k of NOTICE_KINDS.filter((x) => x.automatic)) {
    const list = plans.filter((p) => p.kind === k.kind);
    console.log(`   · ${k.label}: ${list.length}${list[0] ? ` — p. ej. «${list[0].preview.slice(0, 90)}…»` : ""}`);
  }
  check("claves únicas", new Set(plans.map((p) => p.key)).size === plans.length);
  check("ninguno vacío de variables", plans.every((p) => p.variables.every((v) => v.trim().length > 0)));
  const run = await runNotices({ dryRun: true });
  check("modo prueba no envía ni registra nada", (await prisma.memberNotice.count()) === before && Object.values(run.byKind).every((r) => r.sent === 0 && r.mode === "test"));
}

(async () => {
  await partA();
  await partB();
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
})();
