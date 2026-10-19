/**
 * Prueba en seco de los seguimientos que redacta el agente: toma conversaciones
 * reales donde el lead dejó de contestar y muestra qué le escribiría en el toque
 * de +3 h y en el de antes de que cierre la ventana. NO envía nada y NO escribe
 * en la base (solo lee): si el lead había pedido que le escribamos otro día,
 * solo dice qué tarea se crearía.
 *
 * Uso:  npx tsx scripts/test-seguimientos.ts [cuántas=10]
 * Requiere ANTHROPIC_API_KEY y DATABASE_URL.
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { writeNoReplyNudge } from "../src/lib/whatsapp/followup-writer";

const N = Number(process.argv[2] ?? 10);

async function main() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const convs = await prisma.conversation.findMany({
    where: {
      lead: { stage: { in: ["NEW", "CONTACTED", "NEGOTIATING"] } },
      lastOutboundAt: { gte: since },
      botPaused: false,
    },
    orderBy: { lastOutboundAt: "desc" },
    take: N * 3,
    include: { lead: true, messages: { orderBy: { createdAt: "desc" }, take: 4 } },
  });
  // Solo las que terminan en un mensaje nuestro sin respuesta.
  const silent = convs.filter((c) => c.messages[0]?.direction === "OUTBOUND").slice(0, N);

  for (const c of silent) {
    console.log("\n══════════════════════════════════════════════");
    console.log(`${c.lead?.firstName ?? "?"} · ${c.lead?.stage} · ${c.id}`);
    for (const m of [...c.messages].reverse()) {
      console.log(`${m.direction === "INBOUND" ? "👤" : "🤖"} ${m.body.replace(/\s+/g, " ").slice(0, 220)}`);
    }
    for (const step of [1, 2] as const) {
      const r = await writeNoReplyNudge(c.id, step);
      const out =
        r == null ? "(falló o no pasó las guardas: se usaría el texto fijo)"
        : "skip" in r ? "(no escribe: el lead pidió parar)"
        : "postpone" in r ? `(no escribe: pidió que le escribamos el ${r.postpone.toISOString().slice(0, 10)} → tarea para ese día)`
        : r.text;
      console.log(`  ✍️  toque ${step}: ${out}`);
    }
  }
  console.log(`\n${silent.length} conversaciones revisadas.`);
}

main().finally(() => prisma.$disconnect());
