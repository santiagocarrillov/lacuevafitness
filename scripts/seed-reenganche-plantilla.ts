/**
 * Lote de reenganche por PLANTILLA a los leads que quedaron fuera de la ventana
 * de 24h de WhatsApp (los que hasta ahora eran inalcanzables).
 *
 * No envía nada: crea followups NO_REPLY_1D con fireAt = ahora. Quien los manda es
 * el cron de siempre (/api/cron/followups), que al verlos fuera de ventana usa la
 * plantilla `reengagement_no_reply` ya aprobada.
 *
 * Santiago pidió arrancar con un lote chico y medir respuestas/bloqueos antes de
 * soltarlo sobre todos: de ahí el --limit (15 por defecto). Correrlo de nuevo toma
 * a los siguientes, nunca repite a quien ya tiene un followup pendiente.
 *
 * Uso:  npx tsx scripts/seed-reenganche-plantilla.ts               (dry-run, 15)
 *       npx tsx scripts/seed-reenganche-plantilla.ts --apply
 *       npx tsx scripts/seed-reenganche-plantilla.ts --limit 10 --apply
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { templateName } from "../src/lib/whatsapp/templates";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const WINDOW_MS = 24 * 60 * 60 * 1000;

function arg(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const LIMIT = arg("--limit", 15);
/** Hasta qué tan atrás vale la pena reenganchar. */
const DIAS_ATRAS = arg("--dias", 30);

async function main() {
  const now = new Date();
  console.log(
    `\n=== ${APPLY ? "APLICANDO" : "DRY-RUN"} · lote ${LIMIT} · últimos ${DIAS_ATRAS} días ===\n`,
  );

  const desde = new Date(now.getTime() - DIAS_ATRAS * 24 * 60 * 60 * 1000);

  const candidatos = await prisma.lead.findMany({
    where: {
      createdAt: { gte: desde },
      trialScheduledAt: null,
      stage: { notIn: ["CONVERTED", "LOST"] },
      conversation: {
        is: {
          botPaused: false,
          // Fuera de la ventana de 24h: justo los que no se podían tocar.
          lastInboundAt: { lt: new Date(now.getTime() - WINDOW_MS) },
        },
      },
    },
    include: { conversation: { include: { scheduledFollowups: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Nadie recibe dos veces: ni con un followup pendiente, ni con uno ya enviado.
  const elegibles = candidatos.filter((l) => {
    const fs = l.conversation?.scheduledFollowups ?? [];
    return !fs.some(
      (f) => f.kind.startsWith("NO_REPLY") && (f.status === "PENDING" || f.status === "SENT"),
    );
  });

  console.log(
    `— Fuera de ventana: ${candidatos.length} · sin reenganche previo: ${elegibles.length} · ` +
      `se toman: ${Math.min(LIMIT, elegibles.length)}\n`,
  );

  const lote = elegibles.slice(0, LIMIT);
  for (const lead of lote) {
    const conv = lead.conversation!;
    const nombre = templateName(lead.firstName, lead.lastName);
    // Texto libre de respaldo: solo se usa si para cuando dispare el lead ya
    // escribió y la ventana volvió a abrirse.
    const message =
      `¡Hola ${nombre}! 😊 ¿Arrancamos tus dos semanas en La Cueva? Entrena dos semanas ` +
      `por tan solo $9 y aprovecha todo un proceso de evaluación de tu condición física. ` +
      `Cuéntame qué día te queda mejor y lo agendamos. 💪`;

    console.log(
      `  ✅ ${lead.firstName ?? "(sin nombre)"} (${lead.phone}) · ${lead.stage} · ` +
        `plantilla reengagement_no_reply → "¡Hola ${nombre}!"`,
    );

    if (!APPLY) continue;
    await prisma.scheduledFollowup.create({
      data: {
        conversationId: conv.id,
        kind: "NO_REPLY_1D",
        fireAt: now,
        payload: { message },
      },
    });
  }

  const restantes = elegibles.length - lote.length;
  if (restantes > 0) {
    console.log(
      `\n⏭  Quedan ${restantes} para el siguiente lote. Medir respuestas y bloqueos ` +
        `antes de volver a correrlo.`,
    );
  }
  console.log(
    `\nOjo: el cron también tiene techo propio (WHATSAPP_TEMPLATE_DAILY_LIMIT, hoy ` +
      `${process.env.WHATSAPP_TEMPLATE_DAILY_LIMIT ?? 15}/día). Lo que no entre hoy sale mañana.`,
  );
  if (!APPLY) console.log("\nDRY-RUN: no se escribió nada. Reejecutar con --apply.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
