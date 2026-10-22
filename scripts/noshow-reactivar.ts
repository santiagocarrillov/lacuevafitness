/**
 * Reactivación de los no-shows viejos (22 oct 2026).
 *
 * Hasta el 22 oct el no-show recibía UN mensaje (`noshow_recuperacion`) y nada
 * más: 30 de 49 nunca contestaron y nadie les volvió a escribir. Y quien
 * reagendaba y volvía a faltar ni siquiera quedaba marcado (seguía "Agendado").
 * El cron ya cubre los plantones nuevos con tres toques; esto mete a los viejos
 * en los dos que les faltan: `noshow_dia3` y, 4 días después, `noshow_dia7` (ese
 * día el cron deja además la tarea de llamada para recepción).
 *
 * No envía nada: crea followups NOSHOW_RECOVERY_3D/7D. Quien los manda es el cron
 * de siempre, y mientras Meta no apruebe las plantillas esperan en PENDING.
 * También:
 *  - marca como no-show las citas vencidas que se quedaron "Agendado" (el bug del
 *    segundo plantón), igual que el cron;
 *  - pasa a "Asistió" a quien tiene la asistencia registrada y la etapa atrás.
 *
 * Solo entra quien NO escribió después de su cita, con el bot activo, sin toques
 * pendientes y con la cita vencida hace más de 2 días (los recientes los cubre el
 * cron). Se reparten --por-dia por día a las 10:00 (sin domingos) para no comerse
 * el techo diario de plantillas, que es compartido con los recordatorios.
 *
 * Uso:  npx tsx scripts/noshow-reactivar.ts                       (dry-run)
 *       npx tsx scripts/noshow-reactivar.ts --apply
 *       npx tsx scripts/noshow-reactivar.ts --desde 2026-10-23 --por-dia 10 --dias 90 --apply
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { renderTemplate, templateName, TEMPLATE_LANGUAGE } from "../src/lib/whatsapp/templates";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const DAY_MS = 24 * 60 * 60 * 1000;
const EC_OFFSET_MS = 5 * 60 * 60 * 1000;
/** Igual que el cron: 3 h de gracia para registrar la asistencia. */
const NO_SHOW_GRACE_MS = 3 * 60 * 60 * 1000;
/** Igual que RESCUE_MAX_AGE_MS: lo más nuevo lo rescata el cron. */
const RESCUE_MAX_AGE_MS = 2 * DAY_MS;
const GAP_DAYS = 4;

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}
function numArg(flag: string, fallback: number): number {
  const n = Number(arg(flag));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const POR_DIA = numArg("--por-dia", 10);
/** Hasta qué tan atrás vale la pena: una cita de hace 3 meses ya es otro lead. */
const DIAS_ATRAS = numArg("--dias", 90);

/** 10:00 de Ecuador del día `ymd`. */
const at10 = (ymd: string) => new Date(`${ymd}T10:00:00-05:00`);
const ecYmd = (d: Date) => new Date(d.getTime() - EC_OFFSET_MS).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => ecYmd(new Date(at10(ymd).getTime() + n * DAY_MS));
const isSunday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay() === 0;
const nextNonSunday = (ymd: string) => (isSunday(ymd) ? addDays(ymd, 1) : ymd);

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", dateStyle: "medium", timeStyle: "short" }).format(d);

async function main() {
  const now = new Date();
  const desde = arg("--desde") ?? addDays(ecYmd(now), 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) throw new Error(`--desde inválido: ${desde}`);
  console.log(`\n=== ${APPLY ? "APLICANDO" : "DRY-RUN"} · ${POR_DIA}/día desde ${desde} · citas de los últimos ${DIAS_ATRAS} días ===\n`);

  // 1. Etapa atrás: asistencia registrada y todavía "Agendado".
  const atrasados = await prisma.lead.findMany({
    where: { stage: "SCHEDULED_TRIAL", trialAttended: true },
    select: { id: true, firstName: true, lastName: true },
  });
  console.log(`Asistieron pero siguen "Agendado": ${atrasados.length}`);
  for (const l of atrasados) console.log(`  · ${l.firstName} ${l.lastName ?? ""}`.trimEnd());
  if (APPLY && atrasados.length) {
    await prisma.lead.updateMany({ where: { id: { in: atrasados.map((l) => l.id) } }, data: { stage: "TRIAL_ATTENDED" } });
  }

  // 2. Candidatos: no-shows y citas vencidas sin asistencia, con WhatsApp.
  const leads = await prisma.lead.findMany({
    where: {
      trialScheduledAt: { gte: new Date(now.getTime() - DIAS_ATRAS * DAY_MS), lt: new Date(now.getTime() - NO_SHOW_GRACE_MS) },
      OR: [
        { stage: "TRIAL_NO_SHOW" },
        { stage: "SCHEDULED_TRIAL", OR: [{ trialAttended: null }, { trialAttended: false }] },
      ],
      conversation: { isNot: null },
    },
    select: {
      id: true, firstName: true, lastName: true, sede: true, stage: true, trialScheduledAt: true,
      conversation: { select: { id: true, botPaused: true, lastInboundAt: true } },
    },
    orderBy: { trialScheduledAt: "desc" },
  });

  const elegidos: typeof leads = [];
  const fuera: Record<string, number> = {};
  const skip = (why: string) => (fuera[why] = (fuera[why] ?? 0) + 1);
  for (const l of leads) {
    const conv = l.conversation!;
    const cita = l.trialScheduledAt!;
    if (now.getTime() - cita.getTime() <= RESCUE_MAX_AGE_MS) { skip("cita reciente: la rescata el cron"); continue; }
    if (conv.botPaused) { skip("bot en pausa (lo atiende una persona)"); continue; }
    if (conv.lastInboundAt && conv.lastInboundAt > cita) { skip("escribió después de su cita"); continue; }
    const pendiente = await prisma.scheduledFollowup.findFirst({
      where: { conversationId: conv.id, status: "PENDING" },
      select: { kind: true },
    });
    if (pendiente) { skip(`ya tiene un toque pendiente`); continue; }
    const yaTuvo = await prisma.scheduledFollowup.findFirst({
      where: { conversationId: conv.id, kind: { in: ["NOSHOW_RECOVERY_3D", "NOSHOW_RECOVERY_7D"] }, createdAt: { gte: cita } },
      select: { id: true },
    });
    if (yaTuvo) { skip("ya recibió el rescate nuevo"); continue; }
    elegidos.push(l);
  }

  console.log(`\nCandidatos: ${leads.length} · entran: ${elegidos.length}`);
  for (const [why, n] of Object.entries(fuera)) console.log(`  fuera (${n}): ${why}`);

  let day = nextNonSunday(desde);
  let enElDia = 0;
  console.log("");
  for (const l of elegidos) {
    if (enElDia >= POR_DIA) {
      day = nextNonSunday(addDays(day, 1));
      enElDia = 0;
    }
    enElDia += 1;
    const day3 = at10(day);
    const day7 = at10(nextNonSunday(addDays(day, GAP_DAYS)));
    const variables = [templateName(l.firstName, l.lastName)];
    const text = (name: string) => renderTemplate({ name, language: TEMPLATE_LANGUAGE, variables });
    const stuck = l.stage === "SCHEDULED_TRIAL";
    console.log(
      `  ${l.firstName.padEnd(18).slice(0, 18)} ${l.sede.padEnd(14)} cita ${fmt(l.trialScheduledAt!)}` +
        `${stuck ? " (seguía Agendado)" : ""} → ${fmt(day3)} / ${fmt(day7)}`,
    );
    if (!APPLY) continue;
    if (stuck) {
      await prisma.lead.update({ where: { id: l.id }, data: { stage: "TRIAL_NO_SHOW", trialAttended: false } });
    }
    await prisma.scheduledFollowup.createMany({
      data: [
        { conversationId: l.conversation!.id, kind: "NOSHOW_RECOVERY_3D", fireAt: day3, status: "PENDING", payload: { message: text("noshow_dia3"), source: "noshow-reactivar" } },
        { conversationId: l.conversation!.id, kind: "NOSHOW_RECOVERY_7D", fireAt: day7, status: "PENDING", payload: { message: text("noshow_dia7"), source: "noshow-reactivar" } },
      ],
    });
  }

  console.log(APPLY ? `\nListo: ${elegidos.length} leads con sus dos toques programados.` : "\nDry-run: no se escribió nada. Agrega --apply.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
