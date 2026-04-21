/**
 * Cleanup script — fast SQL-based dedup, fix names, prune unreachable.
 * Usage: npx tsx scripts/cleanup.ts
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== LIMPIEZA DE DATOS (SQL batch) ===\n");

  const before = await prisma.member.count();
  console.log(`Antes: ${before} miembros\n`);

  // ── 1. Delete duplicates — keep the one with most data ────────
  console.log("1. Eliminando duplicados (mismo nombre + sede, conserva el que tiene más datos)...");

  // Identify IDs to delete: for each (firstName, lastName, sede) group with >1,
  // keep the row with best data (has email > has phone > is active > oldest),
  // delete the rest. We do this by ranking and deleting non-rank-1 rows.
  const dupeDeleteResult = await prisma.$executeRaw`
    DELETE FROM "Member"
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY "firstName", "lastName", sede
            ORDER BY
              CASE WHEN email IS NOT NULL THEN 0 ELSE 1 END,
              CASE WHEN phone IS NOT NULL THEN 0 ELSE 1 END,
              CASE WHEN status = 'ACTIVE' THEN 0 WHEN status = 'TRIAL' THEN 1 ELSE 2 END,
              "createdAt" ASC
          ) as rn
        FROM "Member"
      ) ranked
      WHERE rn > 1
    )
  `;
  console.log(`   Eliminados: ${dupeDeleteResult} duplicados\n`);

  // ── 2. Fix empty lastNames ────────────────────────────────────
  console.log("2. Corrigiendo apellidos vacíos...");

  const emptyLast = await prisma.member.findMany({
    where: { lastName: "" },
    select: { id: true, firstName: true },
  });

  let namesFixed = 0;
  for (const m of emptyLast) {
    const parts = m.firstName.trim().split(/\s+/);
    if (parts.length >= 2) {
      await prisma.member.update({
        where: { id: m.id },
        data: { firstName: parts[0], lastName: parts.slice(1).join(" ") },
      });
      namesFixed++;
    }
  }
  console.log(`   Corregidos: ${namesFixed} de ${emptyLast.length}\n`);

  // ── 3. Prune churned contacts with no email AND no phone ──────
  console.log("3. Eliminando contactos CHURNED sin email ni teléfono...");

  // First clean up related records
  const pruneResult = await prisma.$executeRaw`
    DELETE FROM "Member"
    WHERE status = 'CHURNED'
      AND email IS NULL
      AND phone IS NULL
  `;
  console.log(`   Eliminados: ${pruneResult} contactos inalcanzables\n`);

  // ── 4. Trim whitespace from names ─────────────────────────────
  console.log("4. Limpiando espacios en nombres...");

  const trimResult = await prisma.$executeRaw`
    UPDATE "Member"
    SET "firstName" = TRIM("firstName"),
        "lastName" = TRIM("lastName")
    WHERE "firstName" != TRIM("firstName")
       OR "lastName" != TRIM("lastName")
  `;
  console.log(`   Nombres limpiados: ${trimResult}\n`);

  // ── 5. Clean orphaned records ─────────────────────────────────
  console.log("5. Limpiando registros huérfanos...");

  const orphanedAttendance = await prisma.$executeRaw`
    DELETE FROM "Attendance" WHERE "memberId" NOT IN (SELECT id FROM "Member")
  `;
  const orphanedMemberships = await prisma.$executeRaw`
    DELETE FROM "Membership" WHERE "memberId" NOT IN (SELECT id FROM "Member")
  `;
  console.log(`   Asistencias huérfanas: ${orphanedAttendance}`);
  console.log(`   Membresías huérfanas: ${orphanedMemberships}\n`);

  // ── 6. Final stats ────────────────────────────────────────────
  console.log("=== RESULTADO FINAL ===\n");

  const after = await prisma.member.count();
  const activeFC = await prisma.member.count({
    where: { sede: "FITNESS_CENTER", status: { in: ["ACTIVE", "TRIAL"] } },
  });
  const churnedFC = await prisma.member.count({
    where: { sede: "FITNESS_CENTER", status: "CHURNED" },
  });
  const activeXT = await prisma.member.count({
    where: { sede: "XTREME", status: { in: ["ACTIVE", "TRIAL"] } },
  });
  const churnedXT = await prisma.member.count({
    where: { sede: "XTREME", status: "CHURNED" },
  });
  const withContact = await prisma.member.count({
    where: { OR: [{ email: { not: null } }, { phone: { not: null } }] },
  });

  console.log(`Eliminados: ${before - after} miembros en total`);
  console.log(`Fitness Center: ${activeFC} activos + ${churnedFC} históricos`);
  console.log(`Xtreme:         ${activeXT} activos + ${churnedXT} históricos`);
  console.log(`Total:          ${after} socios`);
  console.log(`Alcanzables:    ${withContact} (tienen email o teléfono)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
