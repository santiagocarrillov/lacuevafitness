/**
 * Seeds the Bloque 3 programming (weeks 19-27, 7 sep - 7 nov 2026) into
 * `SrxfitSessionOverride`, parsed straight from the reviewed proposal:
 *
 *   exports/SRXFit_Bloque3_Sem1-9_propuesta.md
 *
 * The document's weeks are numbered 1-9 (the block's own numbering); they map
 * to plan weeks 19-27. Each `### # <Bloque>` section becomes one markdown
 * column on the override row.
 *
 * Idempotent: upserts on (weekNumber, dayIndex), so re-running after editing
 * the .md re-syncs production. Dry run by default.
 *
 *   npx tsx scripts/seed-bloque3-overrides.ts          # dry run
 *   npx tsx scripts/seed-bloque3-overrides.ts --write  # writes to the DB
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";

const WRITE = process.argv.includes("--write");
const SRC = resolve(process.cwd(), "exports/SRXFit_Bloque3_Sem1-9_propuesta.md");
const WEEK_OFFSET = 18; // doc week 1 -> plan week 19

const DAY_INDEX: Record<string, number> = {
  Lun: 1, Mar: 2, "Mié": 3, Jue: 4, Vie: 5, "Sáb": 6,
};

type Session = {
  weekNumber: number;
  dayIndex: number;
  title: string;
  activacionMd: string | null;
  fuerzaMd: string | null;
  acondicionamientoMd: string | null;
  regulacionMd: string | null;
};

/** Which override column each `### #` block heading belongs to. */
function columnFor(heading: string): keyof Session | null {
  const h = heading.toLowerCase();
  if (h.startsWith("activación")) return "activacionMd";
  if (h.startsWith("fuerza") || h.startsWith("bloque principal")) return "fuerzaMd";
  if (h.startsWith("acondicionamiento") || h.startsWith("entrega")) return "acondicionamientoMd";
  if (h.startsWith("regulación")) return "regulacionMd";
  return null;
}

function parse(md: string): Session[] {
  const lines = md.split("\n");
  const sessions: Session[] = [];
  let week: number | null = null;
  let cur: Session | null = null;
  let col: keyof Session | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (cur && col) {
      // Drop the markdown `---` separators that close each session in the doc.
      const text = buf.join("\n").replace(/(\n\s*---\s*)+$/, "").trim();
      if (text) {
        const prev = cur[col] as string | null;
        (cur[col] as string | null) = prev ? `${prev}\n\n${text}` : text;
      }
    }
    buf = [];
  };

  for (const line of lines) {
    const mWeek = /^# SEMANA (\d+)/.exec(line);
    if (mWeek) {
      flush();
      col = null;
      cur = null;
      week = parseInt(mWeek[1], 10);
      continue;
    }
    // A `## Lun 7 · Unilateral` heading opens a session; any other `## ` closes one.
    const mDay = /^## (Lun|Mar|Mié|Jue|Vie|Sáb) (\d+) · (.+)$/.exec(line);
    if (line.startsWith("## ")) {
      flush();
      col = null;
      cur = null;
      if (mDay && week !== null) {
        cur = {
          weekNumber: week + WEEK_OFFSET,
          dayIndex: DAY_INDEX[mDay[1]],
          title: `${mDay[1]} ${mDay[2]} · ${mDay[3]}`,
          activacionMd: null, fuerzaMd: null, acondicionamientoMd: null, regulacionMd: null,
        };
        sessions.push(cur);
      }
      continue;
    }
    const mBlock = /^### # (.+)$/.exec(line);
    if (mBlock && cur) {
      flush();
      col = columnFor(mBlock[1]);
      // Keep the block heading itself, in the same shape the existing overrides use.
      if (col) buf.push(`# ${mBlock[1]}`);
      continue;
    }
    if (cur && col) buf.push(line);
  }
  flush();
  return sessions;
}

async function main() {
  const sessions = parse(readFileSync(SRC, "utf8"));

  const problems: string[] = [];
  if (sessions.length !== 54) problems.push(`se esperaban 54 sesiones, se parsearon ${sessions.length}`);
  for (const s of sessions) {
    if (s.weekNumber < 19 || s.weekNumber > 27) problems.push(`${s.title}: semana fuera de rango (${s.weekNumber})`);
    if (!s.dayIndex) problems.push(`${s.title}: día no reconocido`);
    for (const k of ["activacionMd", "fuerzaMd", "acondicionamientoMd", "regulacionMd"] as const) {
      if (!s[k]) problems.push(`sem ${s.weekNumber} día ${s.dayIndex} (${s.title}): falta ${k}`);
    }
  }
  const seen = new Set<string>();
  for (const s of sessions) {
    const key = `${s.weekNumber}-${s.dayIndex}`;
    if (seen.has(key)) problems.push(`sesión duplicada: ${key}`);
    seen.add(key);
  }

  console.log(`Parseadas ${sessions.length} sesiones · semanas ${sessions[0]?.weekNumber}-${sessions[sessions.length - 1]?.weekNumber}`);
  for (let w = 19; w <= 27; w++) {
    const inWeek = sessions.filter((s) => s.weekNumber === w);
    const chars = inWeek.reduce((n, s) => n + (s.activacionMd!.length + s.fuerzaMd!.length + s.acondicionamientoMd!.length + s.regulacionMd!.length), 0);
    console.log(`  sem ${w}: ${inWeek.length} días · ${chars.toLocaleString("es")} caracteres`);
  }

  if (problems.length) {
    console.error(`\n✗ ${problems.length} problema(s):`);
    problems.slice(0, 20).forEach((p) => console.error("  -", p));
    process.exit(1);
  }
  console.log("\n✓ Validación OK: 54 sesiones, 4 bloques cada una, sin duplicados.");

  if (!WRITE) {
    console.log("\nDRY RUN — nada escrito. Correr con --write para sembrar.");
    return;
  }

  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const owner = await prisma.user.findFirst({ where: { role: "OWNER" }, select: { id: true, fullName: true } });
  if (!owner) throw new Error("No se encontró un usuario OWNER para atribuir las ediciones.");

  const before = await prisma.srxfitSessionOverride.count({ where: { weekNumber: { gte: 19 } } });

  // Interactive transaction with a generous timeout: 54 upserts over a pooled
  // remote connection blow past the 5s default and roll the whole batch back.
  await prisma.$transaction(
    async (tx) => {
      for (const s of sessions) {
        await tx.srxfitSessionOverride.upsert({
          where: { weekNumber_dayIndex: { weekNumber: s.weekNumber, dayIndex: s.dayIndex } },
          create: {
            weekNumber: s.weekNumber,
            dayIndex: s.dayIndex,
            activacionMd: s.activacionMd,
            fuerzaMd: s.fuerzaMd,
            acondicionamientoMd: s.acondicionamientoMd,
            regulacionMd: s.regulacionMd,
            updatedById: owner.id,
          },
          update: {
            activacionMd: s.activacionMd,
            fuerzaMd: s.fuerzaMd,
            acondicionamientoMd: s.acondicionamientoMd,
            regulacionMd: s.regulacionMd,
            updatedById: owner.id,
          },
        });
      }
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  const after = await prisma.srxfitSessionOverride.count({ where: { weekNumber: { gte: 19 } } });
  const legacy = await prisma.srxfitSessionOverride.count({ where: { weekNumber: { lte: 18 } } });
  console.log(`\n✓ Sembrado. Overrides sem 19-27: ${before} → ${after}. Atribuido a ${owner.fullName}.`);
  console.log(`  Overrides históricos (sem 1-18) intactos: ${legacy}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
