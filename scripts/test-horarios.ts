/**
 * Los horarios que dice el bot tienen que ser los que existen de verdad.
 *
 * El 22 sep 2026 alguien llegó a Fitness a las 8:30 pm a su evaluación, cuando
 * ya estaban cerrando, porque el bot le dijo que había clase. Nunca la hubo. El
 * prompt tenía un turno fantasma al final de cada bloque en las dos sedes, y dos
 * personas fueron citadas a las 9:30 am en Fitness, una hora inexistente; las
 * dos figuran como no-show.
 *
 * Esta prueba compara `SEDE_INFO` contra `ClassSchedule` (activos, L–V) en la
 * base real. Si alguien cambia los horarios del gimnasio y no toca el prompt,
 * esto falla antes de que un cliente llegue a una puerta cerrada.
 *
 * Uso:  npx tsx scripts/test-horarios.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { SEDE_INFO, sedeSlots24h } from "../src/lib/whatsapp/agent";
import type { Sede } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
});

const DIAS_LABORALES = ["MON", "TUE", "WED", "THU", "FRI"] as const;

(async () => {
  let fallos = 0;
  for (const sede of ["FITNESS_CENTER", "XTREME"] as Sede[]) {
    const filas = await prisma.classSchedule.findMany({
      where: { sede, active: true, dayOfWeek: { in: [...DIAS_LABORALES] } },
      select: { startTime: true },
      distinct: ["startTime"],
      orderBy: { startTime: "asc" },
    });
    const reales = filas.map((f) => f.startTime).sort();
    const dichos = sedeSlots24h(sede).sort();

    const inventados = dichos.filter((h) => !reales.includes(h));
    const omitidos = reales.filter((h) => !dichos.includes(h));

    const ok = inventados.length === 0 && omitidos.length === 0;
    if (!ok) fallos++;
    console.log(`${ok ? "✅" : "❌"} ${SEDE_INFO[sede].name}`);
    console.log(`   dice:  ${dichos.join(", ")}`);
    console.log(`   hay:   ${reales.join(", ")}`);
    if (inventados.length) console.log(`   ⚠️  INVENTADOS (la gente llega y no hay clase): ${inventados.join(", ")}`);
    if (omitidos.length) console.log(`   ⚠️  omitidos (perdemos cupos que sí existen): ${omitidos.join(", ")}`);
  }

  console.log(fallos === 0 ? "\n✅ El bot dice los horarios que existen" : `\n❌ ${fallos} sede(s) desalineada(s)`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
})();
