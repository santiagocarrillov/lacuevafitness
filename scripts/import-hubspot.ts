/**
 * Import members from HubSpot CSV export.
 *
 * Usage:
 *   npx tsx scripts/import-hubspot.ts <path-to-csv> <sede>
 *
 * Example:
 *   npx tsx scripts/import-hubspot.ts data/hubspot-fitness.csv FITNESS_CENTER
 *   npx tsx scripts/import-hubspot.ts data/hubspot-xtreme.csv XTREME
 *
 * Expected CSV columns (HubSpot default export):
 *   First Name, Last Name, Email, Phone Number, Create Date, ...
 *
 * The script is idempotent — if a member with the same email already exists,
 * it will be skipped (not duplicated).
 */

import { readFileSync } from "fs";
import { PrismaClient, Sede, MemberStatus } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  // Handle quoted values with commas inside
  function parseLine(line: string): string[] {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().trim());
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
}

// Try to match common HubSpot column names
function getField(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const val = row[k] ?? row[k.toLowerCase()];
    if (val) return val.trim();
  }
  return "";
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: npx tsx scripts/import-hubspot.ts <csv-path> <FITNESS_CENTER|XTREME>");
    process.exit(1);
  }

  const csvPath = args[0];
  const sede = args[1] as Sede;
  if (!["FITNESS_CENTER", "XTREME"].includes(sede)) {
    console.error("Sede must be FITNESS_CENTER or XTREME");
    process.exit(1);
  }

  console.log(`Importing from ${csvPath} into ${sede}...`);

  const content = readFileSync(csvPath, "utf-8");
  const rows = parseCSV(content);
  console.log(`  Parsed ${rows.length} rows`);

  // Show detected columns
  if (rows.length > 0) {
    console.log(`  Columns: ${Object.keys(rows[0]).join(", ")}`);
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const firstName = getField(row, "first name", "firstname", "nombre", "first_name");
    const lastName = getField(row, "last name", "lastname", "apellido", "last_name");
    const email = getField(row, "email", "email address", "correo", "correo electrónico");
    const phone = getField(row, "phone number", "phone", "teléfono", "telefono", "mobile phone number");

    if (!firstName && !lastName) {
      skipped++;
      continue;
    }

    try {
      // Check for existing member by email
      if (email) {
        const existing = await prisma.member.findUnique({ where: { email } });
        if (existing) {
          skipped++;
          continue;
        }
      }

      await prisma.member.create({
        data: {
          firstName: firstName || "Sin nombre",
          lastName: lastName || "Sin apellido",
          email: email || undefined,
          phone: phone || undefined,
          sede,
          status: MemberStatus.ACTIVE,
        },
      });
      created++;
    } catch (e: any) {
      // Unique constraint violation — skip
      if (e.code === "P2002") {
        skipped++;
      } else {
        console.error(`  Error importing ${firstName} ${lastName}: ${e.message}`);
        errors++;
      }
    }
  }

  console.log(`\nImport complete:`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped (existing/empty): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  const total = await prisma.member.count({ where: { sede } });
  console.log(`  Total members in ${sede}: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
