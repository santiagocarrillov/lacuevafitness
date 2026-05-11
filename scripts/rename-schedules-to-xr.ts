/**
 * One-off: rename ClassSchedule.name from "WOD HH:MM" / "Funcional HH:MM" to "XR HH:MM".
 * Usage: npx tsx scripts/rename-schedules-to-xr.ts
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const schedules = await prisma.classSchedule.findMany({
    where: {
      OR: [{ name: { startsWith: "WOD " } }, { name: { startsWith: "Funcional " } }],
    },
  });

  console.log(`Found ${schedules.length} schedules to rename.`);

  let updated = 0;
  for (const s of schedules) {
    const newName = s.name.replace(/^(WOD|Funcional) /, "XR ");
    if (newName === s.name) continue;
    await prisma.classSchedule.update({
      where: { id: s.id },
      data: { name: newName },
    });
    console.log(`  ${s.name} → ${newName}  (${s.sede})`);
    updated++;
  }

  console.log(`\nDone. Renamed ${updated} schedules.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
