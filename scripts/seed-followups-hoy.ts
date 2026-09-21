/**
 * Siembra los envíos de hoy (21 sep 2026), pedidos por Santiago:
 *
 *   1. Recordatorio 1 HORA ANTES a cada lead con evaluación agendada hoy
 *      (reemplaza los recordatorios de 2h que ya estaban pendientes — uno de
 *      ellos disparaba 05:30, antes del piso de las 6:00 am que pidió).
 *   2. Seguimiento a los leads que aún NO agendan, a las 8:00 am.
 *
 * Los envía el cron de siempre (/api/cron/followups, cada 15 min), que respeta
 * la ventana de 24h de WhatsApp y cancela solo lo que esté en manos de un humano.
 * Este script NO envía nada por sí mismo.
 *
 * Uso:  npx tsx scripts/seed-followups-hoy.ts          (dry-run, no escribe)
 *       npx tsx scripts/seed-followups-hoy.ts --apply  (escribe)
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { SEDE_INFO } from "../src/lib/whatsapp/agent";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const HOUR_MS = 60 * 60 * 1000;
const WINDOW_MS = 24 * HOUR_MS;

/** Piso que pidió Santiago: nada sale antes de las 6:00 am Ecuador. */
const FLOOR_UTC = new Date("2026-09-21T11:00:00.000Z"); // 06:00 Ecuador
/** Hora del seguimiento masivo a quienes no han agendado. */
const NUDGE_AT_UTC = new Date("2026-09-21T13:00:00.000Z"); // 08:00 Ecuador
const DAY_START_UTC = new Date("2026-09-21T05:00:00.000Z");
const DAY_END_UTC = new Date("2026-09-22T05:00:00.000Z");

const hhmm = (d: Date) =>
  new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);

const firstName = (s: string | null) => (s ?? "").split(/\s+/)[0] ?? "";

async function main() {
  const now = new Date();
  console.log(`\n=== ${APPLY ? "APLICANDO" : "DRY-RUN"} · ahora ${now.toISOString()} ===\n`);

  // ── 1. Recordatorios 1h antes ────────────────────────────────────────────
  const citas = await prisma.lead.findMany({
    where: {
      trialScheduledAt: { gte: DAY_START_UTC, lt: DAY_END_UTC },
      stage: { in: ["SCHEDULED_TRIAL", "CONTACTED", "NEGOTIATING"] },
    },
    include: { conversation: true },
    orderBy: { trialScheduledAt: "asc" },
  });

  console.log(`— Citas de hoy: ${citas.length}`);
  for (const lead of citas) {
    const conv = lead.conversation;
    const when = lead.trialScheduledAt!;
    if (!conv) {
      console.log(`  ⚠️  ${lead.firstName}: sin conversación de WhatsApp — saltado`);
      continue;
    }

    // 1h antes, nunca antes de las 6am; si ya pasó, sale en la próxima corrida.
    let fireAt = new Date(when.getTime() - HOUR_MS);
    if (fireAt < FLOOR_UTC) fireAt = FLOOR_UTC;
    if (fireAt < now) fireAt = new Date(now.getTime() + 60_000);

    const sedeName = SEDE_INFO[lead.sede].name;
    const message =
      `¡Hola ${firstName(lead.firstName)}! En una hora es tu primera sesión en ${sedeName} ` +
      `(${hhmm(when)}). Llega 15 min antes para tomarte los datos de tu evaluación. ` +
      `¡Te esperamos! 📍💪`;

    // ¿Llegará dentro de la ventana de 24h al momento de disparar?
    const alcanzable =
      conv.lastInboundAt != null && fireAt.getTime() - conv.lastInboundAt.getTime() < WINDOW_MS;

    console.log(
      `  ${alcanzable ? "✅" : "🚫"} ${lead.firstName} (${lead.phone}) · cita ${hhmm(when)} · ` +
        `aviso ${hhmm(fireAt)}${alcanzable ? "" : " — FUERA DE VENTANA 24h, no se podrá enviar"}`,
    );

    if (!APPLY) continue;
    await prisma.scheduledFollowup.updateMany({
      where: {
        conversationId: conv.id,
        kind: { in: ["TRIAL_REMINDER_2H", "TRIAL_REMINDER_1H"] },
        status: "PENDING",
      },
      data: { status: "CANCELED", errorMessage: "reemplazado por recordatorio de 1h" },
    });
    await prisma.scheduledFollowup.create({
      data: { conversationId: conv.id, kind: "TRIAL_REMINDER_1H", fireAt, payload: { message } },
    });
  }

  // ── 2. Seguimiento a quienes no han agendado ─────────────────────────────
  const sinCita = await prisma.lead.findMany({
    where: {
      createdAt: { gte: new Date("2026-09-17T00:00:00.000Z") },
      trialScheduledAt: null,
      stage: { notIn: ["CONVERTED", "LOST"] },
      conversation: { is: { botPaused: false } },
    },
    include: {
      conversation: {
        include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
    },
  });

  const elegibles = sinCita.filter((l) => {
    const conv = l.conversation;
    if (!conv?.lastInboundAt) return false;
    // Solo a quien dejamos de escuchar: el último mensaje es nuestro.
    if (conv.messages[0]?.direction !== "OUTBOUND") return false;
    // Y solo si la ventana de 24h sigue abierta a las 8:00 am.
    return NUDGE_AT_UTC.getTime() - conv.lastInboundAt.getTime() < WINDOW_MS;
  });

  console.log(`\n— Sin cita: ${sinCita.length} · alcanzables a las 8:00 am: ${elegibles.length}`);
  for (const lead of elegibles) {
    const conv = lead.conversation!;
    const message =
      `¡Hola ${firstName(lead.firstName)}! 👋 Te escribo de La Cueva. ` +
      `¿Te animas a arrancar tus dos semanas por $9 esta semana? ` +
      `Dime qué horario te queda mejor —mañana o tarde— y te aparto el cupo 💪`;

    console.log(`  ✅ ${lead.firstName} (${lead.phone}) · ${lead.stage}`);

    if (!APPLY) continue;
    // Sin duplicados: si ya tiene un nudge pendiente, no se agrega otro.
    const yaTiene = await prisma.scheduledFollowup.count({
      where: { conversationId: conv.id, kind: "NO_REPLY_1D", status: "PENDING" },
    });
    if (yaTiene > 0) continue;
    await prisma.scheduledFollowup.create({
      data: {
        conversationId: conv.id,
        kind: "NO_REPLY_1D",
        fireAt: NUDGE_AT_UTC,
        payload: { message },
      },
    });
  }

  const noAlcanzables = sinCita.length - elegibles.length;
  console.log(
    `\n🚫 ${noAlcanzables} leads sin cita quedan fuera: ventana de 24h cerrada y la WABA no ` +
      `tiene plantillas aprobadas en español (solo 'hello_world'). No se les puede escribir hoy.\n`,
  );

  if (!APPLY) console.log("DRY-RUN: no se escribió nada. Reejecutar con --apply.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
