/**
 * Import all members from Excel (Fitness) + HubSpot CSVs (both sedes).
 *
 * Usage: npx tsx scripts/import-all.ts
 *
 * Strategy:
 * 1. Fitness Center: import ~100 active members from Excel, enrich with HubSpot data
 * 2. Xtreme: import active Clients from HubSpot (activity in Mar/Apr 2026)
 * 3. Both: import historical Clients as CHURNED for remarketing
 */

import { readFileSync } from "fs";
import { PrismaClient, Sede, MemberStatus, MembershipState, BillingCycle } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const DATA_DIR = "/Users/santiagocarrillo/La Cueva app/Datos existentes";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// ── CSV Parser ──────────────────────────────────────────────────────

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return [];

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

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function getHubspotField(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k]?.trim()) return row[k].trim();
  }
  return "";
}

// ── Excel Parser (using openpyxl via python subprocess) ─────────────

function parseExcelMembers(): {
  name: string;
  planType: string;
  amount: number;
  paymentMethod: string;
}[] {
  // We'll use the data we already know from analysis
  const { execSync } = require("child_process");
  const result = execSync(`python3 -c "
import openpyxl, json
wb = openpyxl.load_workbook('${DATA_DIR}/INDICADORES DIARIOS LA CUEVA.xlsx', read_only=True, data_only=True)
ws = wb['Rporte Mes Clietes 2026']
members = []
plan_type = 'CANJE'
for row in ws.iter_rows(min_row=7, max_row=200, values_only=True):
    cells = list(row)
    name = str(cells[0]).strip() if len(cells) > 0 and cells[0] else ''
    value = cells[1] if len(cells) > 1 else None
    payment = str(cells[2]).strip() if len(cells) > 2 and cells[2] else ''

    if not name or name == 'None':
        continue

    upper = name.upper().strip()
    if upper in ['NOMBRE Y APELLIDO', 'TOTAL CANJE', 'TOTAL DIARIOS', 'TOTAL MENSUALES', 'TOTAL TRIMESTRALES', 'TOTAL ANUALES', 'TOTAL SEMESTRAL', 'TOTAL GENERAL']:
        continue
    if upper == 'DIARIO':
        plan_type = 'DIARIO'
        continue
    if upper == 'MENSUALES' or upper == 'MENSUAL':
        plan_type = 'MENSUAL'
        continue
    if upper == 'TRIMESTRALES' or upper == 'TRIMESTRAL':
        plan_type = 'TRIMESTRAL'
        continue
    if upper == 'SEMESTRALES' or upper == 'SEMESTRAL':
        plan_type = 'SEMESTRAL'
        continue
    if upper == 'ANUALES' or upper == 'ANUAL':
        plan_type = 'ANUAL'
        continue
    if 'TOTAL' in upper:
        continue

    amount = 0
    try:
        amount = float(value) if value else 0
    except:
        pass

    members.append({
        'name': name,
        'planType': plan_type,
        'amount': amount,
        'paymentMethod': payment
    })

print(json.dumps(members))
"`, { encoding: "utf-8" });
  return JSON.parse(result);
}

// ── Name matching helpers ───────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim();
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  // 3+ parts: first is firstName, rest is lastName
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// ── Date helpers ────────────────────────────────────────────────────

function isRecentDate(dateStr: string): boolean {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    // March 2026 or later
    return d >= new Date("2026-03-01");
  } catch {
    return false;
  }
}

// ── Plan mapping ────────────────────────────────────────────────────

const PLAN_MAP: Record<string, string> = {
  CANJE: "plan-MONTHLY", // treat as monthly for tracking
  DIARIO: "plan-ONE_TIME",
  MENSUAL: "plan-MONTHLY",
  TRIMESTRAL: "plan-QUARTERLY",
  SEMESTRAL: "plan-SEMIANNUAL",
  ANUAL: "plan-ANNUAL",
};

// Ensure ONE_TIME plan exists
async function ensureOneTimePlan() {
  await prisma.membershipPlan.upsert({
    where: { id: "plan-ONE_TIME" },
    update: {},
    create: {
      id: "plan-ONE_TIME",
      name: "Pase diario",
      priceCents: 400,
      billingCycle: BillingCycle.ONE_TIME,
      durationDays: 1,
      currency: "USD",
    },
  });
}

// ── Main import ─────────────────────────────────────────────────────

async function main() {
  console.log("=== IMPORTACIÓN COMPLETA DE SOCIOS ===\n");

  await ensureOneTimePlan();

  // ── 1. Parse sources ──────────────────────────────────────────

  console.log("1. Leyendo fuentes de datos...");

  const excelMembers = parseExcelMembers();
  console.log(`   Excel Fitness: ${excelMembers.length} socios activos`);

  const hubspotFC = parseCSV(
    readFileSync(`${DATA_DIR}/La Cueva Fitness HubSpot-all-contacts 4-2026.csv`, "utf-8"),
  );
  console.log(`   HubSpot Fitness: ${hubspotFC.length} contactos`);

  const hubspotXT = parseCSV(
    readFileSync(`${DATA_DIR}/La Cueva Xtreme all-contacts 4-2026.csv`, "utf-8"),
  );
  console.log(`   HubSpot Xtreme: ${hubspotXT.length} contactos\n`);

  // ── 2. Build HubSpot lookup by name ───────────────────────────

  console.log("2. Indexando HubSpot por nombre...");

  function buildHubspotIndex(rows: Record<string, string>[]) {
    const index = new Map<string, Record<string, string>>();
    for (const row of rows) {
      const nombre = getHubspotField(row, "Nombre");
      const apellido = getHubspotField(row, "Apellidos");
      const fullName = `${nombre} ${apellido}`.trim();
      if (fullName) {
        index.set(normalizeName(fullName), row);
      }
      // Also index by "Nombre y Apellido" field
      const combined = getHubspotField(row, "Nombre y Apellido");
      if (combined) {
        index.set(normalizeName(combined), row);
      }
    }
    return index;
  }

  const hubspotFCIndex = buildHubspotIndex(hubspotFC);
  const hubspotXTIndex = buildHubspotIndex(hubspotXT);
  console.log(`   Fitness indexed: ${hubspotFCIndex.size} nombres`);
  console.log(`   Xtreme indexed: ${hubspotXTIndex.size} nombres\n`);

  // ── 3. Import Fitness Center active members from Excel ────────

  console.log("3. Importando Fitness Center (desde Excel + enriquecimiento HubSpot)...");

  let fcCreated = 0;
  let fcEnriched = 0;
  let fcSkipped = 0;
  const seenEmails = new Set<string>();

  for (const em of excelMembers) {
    const { firstName, lastName } = splitName(em.name);
    if (!firstName) { fcSkipped++; continue; }

    // Try to find in HubSpot for enrichment
    const normalized = normalizeName(em.name);
    const hubRow = hubspotFCIndex.get(normalized);

    const email = hubRow ? getHubspotField(hubRow, "Correo", "Correo electrónico") : "";
    const phone = hubRow
      ? getHubspotField(hubRow, "Número de teléfono", "Número de móvil", "Número de teléfono de WhatsApp")
      : "";
    const dobStr = hubRow ? getHubspotField(hubRow, "Fecha de nacimiento") : "";
    const dob = dobStr ? new Date(dobStr) : null;
    const validDob = dob && !isNaN(dob.getTime()) ? dob : undefined;

    // Skip if email already seen (dedup)
    if (email && seenEmails.has(email.toLowerCase())) { fcSkipped++; continue; }
    if (email) seenEmails.add(email.toLowerCase());

    try {
      // Check existing by email
      if (email) {
        const existing = await prisma.member.findUnique({ where: { email } });
        if (existing) { fcSkipped++; continue; }
      }

      const member = await prisma.member.create({
        data: {
          firstName,
          lastName,
          email: email || undefined,
          phone: phone || undefined,
          dateOfBirth: validDob,
          sede: Sede.FITNESS_CENTER,
          status: em.planType === "CANJE" ? MemberStatus.ACTIVE : MemberStatus.ACTIVE,
          notes: em.paymentMethod
            ? `Plan Excel: ${em.planType} | $${em.amount} | ${em.paymentMethod}`
            : undefined,
        },
      });

      // Assign membership
      const planId = PLAN_MAP[em.planType] ?? "plan-MONTHLY";
      const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } });
      if (plan) {
        const now = new Date();
        const endsAt = new Date(now);
        endsAt.setDate(endsAt.getDate() + plan.durationDays);
        await prisma.membership.create({
          data: {
            memberId: member.id,
            planId,
            state: MembershipState.ACTIVE,
            startsAt: now,
            endsAt,
          },
        });
      }

      fcCreated++;
      if (hubRow) fcEnriched++;
    } catch (e: any) {
      if (e.code === "P2002") { fcSkipped++; }
      else { console.error(`   Error: ${em.name}: ${e.message}`); }
    }
  }

  console.log(`   Creados: ${fcCreated} | Enriquecidos con HubSpot: ${fcEnriched} | Duplicados: ${fcSkipped}\n`);

  // ── 4. Import Xtreme active clients from HubSpot ──────────────

  console.log("4. Importando Xtreme (Clientes activos desde HubSpot)...");

  let xtCreated = 0;
  let xtSkipped = 0;

  for (const row of hubspotXT) {
    const etapa = getHubspotField(row, "Etapa del ciclo de vida");
    const ultimaActividad = getHubspotField(row, "Última actividad");
    const ultimaMod = getHubspotField(row, "Última modificación");

    // Only import Clients with recent activity
    if (etapa !== "Cliente") continue;
    if (!isRecentDate(ultimaActividad) && !isRecentDate(ultimaMod)) continue;

    const nombre = getHubspotField(row, "Nombre");
    const apellido = getHubspotField(row, "Apellidos");
    if (!nombre && !apellido) { xtSkipped++; continue; }

    const email = getHubspotField(row, "Correo", "Correo electrónico");
    const phone = getHubspotField(row, "Número de teléfono", "Número de móvil", "Número de teléfono de WhatsApp");
    const dobStr = getHubspotField(row, "Fecha de nacimiento");
    const dob = dobStr ? new Date(dobStr) : null;
    const validDob = dob && !isNaN(dob.getTime()) ? dob : undefined;

    if (email && seenEmails.has(email.toLowerCase())) { xtSkipped++; continue; }
    if (email) seenEmails.add(email.toLowerCase());

    try {
      if (email) {
        const existing = await prisma.member.findUnique({ where: { email } });
        if (existing) { xtSkipped++; continue; }
      }

      const member = await prisma.member.create({
        data: {
          firstName: nombre || "Sin nombre",
          lastName: apellido || "",
          email: email || undefined,
          phone: phone || undefined,
          dateOfBirth: validDob,
          sede: Sede.XTREME,
          status: MemberStatus.ACTIVE,
          notes: "Importado de HubSpot (Cliente activo Mar/Abr 2026)",
        },
      });

      // Assign monthly membership by default
      const now = new Date();
      const endsAt = new Date(now);
      endsAt.setDate(endsAt.getDate() + 30);
      await prisma.membership.create({
        data: {
          memberId: member.id,
          planId: "plan-MONTHLY",
          state: MembershipState.ACTIVE,
          startsAt: now,
          endsAt,
        },
      });

      xtCreated++;
    } catch (e: any) {
      if (e.code === "P2002") { xtSkipped++; }
      else { console.error(`   Error: ${nombre} ${apellido}: ${e.message}`); }
    }
  }

  console.log(`   Creados: ${xtCreated} | Duplicados/sin datos: ${xtSkipped}\n`);

  // ── 5. Import historical clients as CHURNED ───────────────────

  console.log("5. Importando clientes históricos (CHURNED para remarketing)...");

  let histCreated = 0;
  let histSkipped = 0;

  async function importHistorical(rows: Record<string, string>[], sede: Sede) {
    let created = 0;
    let skipped = 0;

    for (const row of rows) {
      const etapa = getHubspotField(row, "Etapa del ciclo de vida");
      if (etapa !== "Cliente") continue;

      const ultimaActividad = getHubspotField(row, "Última actividad");
      const ultimaMod = getHubspotField(row, "Última modificación");

      // Skip if already imported as active (recent activity)
      if (isRecentDate(ultimaActividad) || isRecentDate(ultimaMod)) continue;

      const nombre = getHubspotField(row, "Nombre");
      const apellido = getHubspotField(row, "Apellidos");
      const email = getHubspotField(row, "Correo", "Correo electrónico");

      if (!nombre && !apellido) { skipped++; continue; }
      if (email && seenEmails.has(email.toLowerCase())) { skipped++; continue; }
      if (email) seenEmails.add(email.toLowerCase());

      const phone = getHubspotField(row, "Número de teléfono", "Número de móvil", "Número de teléfono de WhatsApp");

      try {
        if (email) {
          const existing = await prisma.member.findUnique({ where: { email } });
          if (existing) { skipped++; continue; }
        }

        await prisma.member.create({
          data: {
            firstName: nombre || "Sin nombre",
            lastName: apellido || "",
            email: email || undefined,
            phone: phone || undefined,
            sede,
            status: MemberStatus.CHURNED,
            churnedAt: new Date(),
            churnReason: "Importado de HubSpot — cliente histórico sin actividad reciente",
          },
        });
        created++;
      } catch (e: any) {
        if (e.code === "P2002") { skipped++; }
        else { skipped++; }
      }
    }
    return { created, skipped };
  }

  const histFC = await importHistorical(hubspotFC, Sede.FITNESS_CENTER);
  const histXT = await importHistorical(hubspotXT, Sede.XTREME);
  histCreated = histFC.created + histXT.created;
  histSkipped = histFC.skipped + histXT.skipped;

  console.log(`   Fitness históricos: ${histFC.created} | Xtreme históricos: ${histXT.created}`);
  console.log(`   Total históricos: ${histCreated} | Duplicados: ${histSkipped}\n`);

  // ── 6. Final stats ────────────────────────────────────────────

  console.log("=== RESUMEN FINAL ===\n");

  const totalFC = await prisma.member.count({ where: { sede: Sede.FITNESS_CENTER } });
  const activeFC = await prisma.member.count({
    where: { sede: Sede.FITNESS_CENTER, status: { in: [MemberStatus.ACTIVE, MemberStatus.TRIAL] } },
  });
  const churnedFC = await prisma.member.count({
    where: { sede: Sede.FITNESS_CENTER, status: MemberStatus.CHURNED },
  });

  const totalXT = await prisma.member.count({ where: { sede: Sede.XTREME } });
  const activeXT = await prisma.member.count({
    where: { sede: Sede.XTREME, status: { in: [MemberStatus.ACTIVE, MemberStatus.TRIAL] } },
  });
  const churnedXT = await prisma.member.count({
    where: { sede: Sede.XTREME, status: MemberStatus.CHURNED },
  });

  console.log(`Fitness Center: ${totalFC} total (${activeFC} activos, ${churnedFC} históricos)`);
  console.log(`Xtreme:         ${totalXT} total (${activeXT} activos, ${churnedXT} históricos)`);
  console.log(`TOTAL:          ${totalFC + totalXT} socios en el CRM`);
  console.log(`\nAbre /dashboard/socios para verlos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
