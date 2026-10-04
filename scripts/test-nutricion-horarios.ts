/**
 * Nutrición — horarios y agendamiento propio.
 *  A. Espacios libres (puro): bloques, citas tomadas, días libres, anticipación, sede.
 *  B. Fecha límite del trial (fin de semana → viernes) y códigos de enlace.
 *  C. Contra la BD real dentro de UNA transacción revertida: horarios + cita → espacios.
 *  D. "Por agendar" de producción (solo lectura).
 *
 * Uso:  npx tsx --env-file=.env scripts/test-nutricion-horarios.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { bookingCode, computeSlots, trialDeadline, weekdayOf, type AvailabilityWindow } from "../src/lib/nutrition/slots";
import { loadSlots } from "../src/lib/nutrition/booking-core";
import { toSchedule } from "../src/lib/nutrition/to-schedule";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
class Rollback extends Error {}

function partA() {
  console.log("\n── A. Espacios libres");
  // Monday 2026-10-05; "now" is the Sunday before, so lead time doesn't interfere.
  const now = new Date("2026-10-04T15:00:00Z");
  const w: AvailabilityWindow = { staffUserId: "n", sede: "FITNESS_CENTER", weekday: 1, startMinute: 16 * 60, endMinute: 18 * 60, slotMinutes: 30 };
  const base = { windows: [w], busy: [], timeOff: [], fromDate: "2026-10-05", days: 1, now };
  const times = (r: ReturnType<typeof computeSlots>) => r[0]?.slots.map((s) => s.time).join(",") ?? "";
  check("lunes 16:00–18:00 cada 30 → 4 espacios", times(computeSlots(base)) === "16:00,16:30,17:00,17:30", times(computeSlots(base)));
  check("16:00 en Ecuador = 21:00 UTC", computeSlots(base)[0].slots[0].startsAt === "2026-10-05T21:00:00.000Z");
  const busy = [{ staffUserId: "n", startsAt: new Date("2026-10-05T21:30:00Z"), durationMin: 30 }];
  check("cita tomada a las 16:30 desaparece", times(computeSlots({ ...base, busy })) === "16:00,17:00,17:30");
  const longBusy = [{ staffUserId: "n", startsAt: new Date("2026-10-05T21:15:00Z"), durationMin: 45 }];
  check("una cita de 45 min que se cruza bloquea dos espacios", times(computeSlots({ ...base, busy: longBusy })) === "17:00,17:30");
  const xtreme = { ...w, sede: "XTREME" as const, startMinute: 17 * 60, endMinute: 18 * 60 };
  const two = computeSlots({ ...base, windows: [w, xtreme], busy: [{ staffUserId: "n", startsAt: new Date("2026-10-05T22:00:00Z"), durationMin: 30 }] });
  check("la misma persona no puede estar en dos sedes a la vez", !two[0].slots.some((s) => s.time === "17:00"));
  check("filtro por sede", computeSlots({ ...base, windows: [w, xtreme], sede: "XTREME" })[0].slots.every((s) => s.sede === "XTREME"));
  const off = [{ staffUserId: "n", startsAt: new Date("2026-10-05T05:00:00Z"), endsAt: new Date("2026-10-06T05:00:00Z") }];
  check("día libre → sin espacios", computeSlots({ ...base, timeOff: off }).length === 0);
  const late = computeSlots({ ...base, now: new Date("2026-10-05T20:00:00Z") });
  check("menos de 2 h de anticipación no se ofrece (15:00 → desde 17:00)", times(late) === "17:00,17:30", times(late));
  check("otros días de la semana no tienen espacios", computeSlots({ ...base, fromDate: "2026-10-06", days: 1 }).length === 0);
  check("dos semanas → dos lunes", computeSlots({ ...base, days: 14 }).length === 2);
}

function partB() {
  console.log("\n── B. Fecha límite del trial y enlaces");
  check("weekdayOf: 5 oct 2026 es lunes", weekdayOf("2026-10-05") === 1 && weekdayOf("2026-10-11") === 7);
  check("vence miércoles → límite martes", trialDeadline("2026-10-07") === "2026-10-06");
  check("vence domingo → día antes es sábado → viernes", trialDeadline("2026-10-11") === "2026-10-09");
  check("vence lunes → día antes es domingo → viernes", trialDeadline("2026-10-12") === "2026-10-09");
  check("vence sábado → viernes", trialDeadline("2026-10-10") === "2026-10-09");
  const c = bookingCode();
  check("código de 10 caracteres sin 0/O/1/l/I", /^[23456789abcdefghjkmnpqrstuvwxyz]{10}$/.test(c), c);
}

async function partC() {
  console.log("\n── C. Horarios en la BD (transacción revertida)");
  const nutri = await prisma.user.findFirst({ where: { active: true, role: { in: ["NUTRITIONIST", "OWNER"] } }, orderBy: { role: "desc" } });
  const member = await prisma.member.findFirst({ where: { status: "ACTIVE" } });
  if (!nutri || !member) return console.log("   (sin nutricionista o socio: se omite)");
  const before = await prisma.nutritionAvailability.count();
  try {
    await prisma.$transaction(async (tx) => {
      // A Tuesday far ahead so real appointments never collide.
      await tx.nutritionAvailability.create({ data: { staffUserId: nutri.id, sede: "XTREME", weekday: 2, startMinute: 7 * 60, endMinute: 8 * 60, slotMinutes: 30 } });
      const day = "2099-03-03";
      check("2099-03-03 es martes", weekdayOf(day) === 2);
      const s1 = await loadSlots(tx, { fromDate: day, days: 1, sede: "XTREME", now: new Date("2099-03-01T12:00:00Z") });
      const mine = s1[0]?.slots.filter((s) => s.staffUserId === nutri.id) ?? [];
      check("aparecen 07:00 y 07:30", mine.map((s) => s.time).join(",") === "07:00,07:30", mine.map((s) => s.time).join(","));
      await tx.nutritionAppointment.create({ data: { memberId: member.id, staffUserId: nutri.id, sede: "XTREME", startsAt: new Date("2099-03-03T12:00:00Z"), durationMin: 30 } });
      const s2 = await loadSlots(tx, { fromDate: day, days: 1, sede: "XTREME", now: new Date("2099-03-01T12:00:00Z") });
      check("con una cita a las 07:00 queda solo 07:30", (s2[0]?.slots.filter((s) => s.staffUserId === nutri.id).map((s) => s.time).join(",") ?? "") === "07:30");
      await tx.nutritionTimeOff.create({ data: { staffUserId: nutri.id, startsAt: new Date("2099-03-03T05:00:00Z"), endsAt: new Date("2099-03-04T05:00:00Z") } });
      const s3 = await loadSlots(tx, { fromDate: day, days: 1, sede: "XTREME", now: new Date("2099-03-01T12:00:00Z") });
      check("con el día bloqueado no queda nada", !(s3[0]?.slots.some((s) => s.staffUserId === nutri.id)));
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  check("nada quedó en la base", (await prisma.nutritionAvailability.count()) === before);
}

async function partD() {
  console.log("\n── D. Por agendar (producción, solo lectura)");
  const items = await toSchedule();
  const trials = items.filter((i) => i.reason === "TRIAL");
  const meas = items.filter((i) => i.reason === "MEASUREMENT");
  check("se calcula sin errores", Array.isArray(items), `${trials.length} trials · ${meas.length} mediciones`);
  check("ninguna fecha límite de trial cae en fin de semana", trials.every((t) => weekdayOf(t.deadline) <= 5));
  check("ordenado por fecha límite", items.every((t, i) => i === 0 || items[i - 1].deadline <= t.deadline));
  for (const t of items.slice(0, 5)) console.log(`   · ${t.reason} ${t.deadline} (${t.daysLeft} d) ${t.detail}`);
}

(async () => {
  partA();
  partB();
  await partC();
  await partD();
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
})();
