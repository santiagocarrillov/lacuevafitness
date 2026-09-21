/**
 * Exports the SRXFit plan + all session overrides into two files for analysis:
 *
 *   exports/srxfit-plan-with-overrides.json
 *     → Full structured snapshot. Each session has the base content +,
 *       if you edited it, the `override` block with your markdown.
 *
 *   exports/srxfit-overrides-only.md
 *     → Human-readable digest of ONLY the sessions you edited.
 *       Easier to scan for patterns ("what did I always change in Activación
 *       during Desafiar weeks?", etc.).
 *
 * Run: npx tsx scripts/export-srxfit-overrides.ts
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import planData from "../src/data/srxfit-plan.json";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const DAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

type Override = {
  weekNumber: number;
  dayIndex: number;
  activacionMd: string | null;
  fuerzaMd: string | null;
  acondicionamientoMd: string | null;
  regulacionMd: string | null;
  coachNotesMd: string | null;
  updatedAt: Date;
  updatedBy: { fullName: string } | null;
};

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  // Load all overrides
  const overridesRaw = await prisma.srxfitSessionOverride.findMany({
    include: { updatedBy: { select: { fullName: true } } },
    orderBy: [{ weekNumber: "asc" }, { dayIndex: "asc" }],
  });
  const overrides = overridesRaw as unknown as Override[];

  console.log(`Loaded ${overrides.length} session overrides from DB.\n`);

  const overrideMap = new Map<string, Override>();
  for (const o of overrides) {
    overrideMap.set(`${o.weekNumber}-${o.dayIndex}`, o);
  }

  // Build snapshot JSON
  type SessionSnapshot = {
    week_number: number;
    day_index: number;
    day_name: string;
    day_name_es: string;
    pattern: string;
    day_type: string;
    base: {
      activacion: unknown;
      fuerza: unknown;
      acondicionamiento: unknown;
      regulacion: unknown;
      coach_notes: string | null;
    };
    override: {
      activacionMd: string | null;
      fuerzaMd: string | null;
      acondicionamientoMd: string | null;
      regulacionMd: string | null;
      coachNotesMd: string | null;
      updatedAt: string;
      updatedBy: string | null;
    } | null;
  };

  type WeekSnapshot = {
    week_number: number;
    block: number;
    block_emphasis: string;
    phase: string;
    week_summary: string;
    breathing_technique: string;
    rotation_key: string;
    sessions: SessionSnapshot[];
  };

  const snapshot: WeekSnapshot[] = [];
  const plan = planData as {
    weeks: Array<Record<string, unknown> & {
      week_number: number;
      block: number;
      block_emphasis: string;
      phase: string;
      week_summary: string;
      breathing_technique: string;
      rotation_key: string;
      days: Array<{
        day_index: number;
        day_name: string;
        pattern: string;
        day_type: string;
        blocks: {
          activacion: unknown;
          fuerza: unknown;
          acondicionamiento: unknown;
          regulacion: unknown;
        };
        coach_notes?: string;
      }>;
    }>;
  };

  for (const week of plan.weeks) {
    const sessions: SessionSnapshot[] = [];
    for (const day of week.days) {
      const ov = overrideMap.get(`${week.week_number}-${day.day_index}`);
      sessions.push({
        week_number: week.week_number,
        day_index: day.day_index,
        day_name: day.day_name,
        day_name_es: DAY_NAMES[day.day_index] ?? day.day_name,
        pattern: day.pattern,
        day_type: day.day_type ?? "Equilibrado",
        base: {
          activacion: day.blocks.activacion,
          fuerza: day.blocks.fuerza,
          acondicionamiento: day.blocks.acondicionamiento,
          regulacion: day.blocks.regulacion,
          coach_notes: day.coach_notes ?? null,
        },
        override: ov
          ? {
              activacionMd: ov.activacionMd,
              fuerzaMd: ov.fuerzaMd,
              acondicionamientoMd: ov.acondicionamientoMd,
              regulacionMd: ov.regulacionMd,
              coachNotesMd: ov.coachNotesMd,
              updatedAt: ov.updatedAt.toISOString(),
              updatedBy: ov.updatedBy?.fullName ?? null,
            }
          : null,
      });
    }
    snapshot.push({
      week_number: week.week_number,
      block: week.block,
      block_emphasis: week.block_emphasis,
      phase: week.phase,
      week_summary: week.week_summary,
      breathing_technique: week.breathing_technique,
      rotation_key: week.rotation_key,
      sessions,
    });
  }

  // ── Write files ────────────────────────────────────────────────────
  const exportsDir = resolve(__dirname, "..", "exports");
  mkdirSync(exportsDir, { recursive: true });

  const today = fmtDate(new Date());
  const jsonPath = resolve(exportsDir, `srxfit-plan-with-overrides-${today}.json`);
  const mdPath = resolve(exportsDir, `srxfit-overrides-only-${today}.md`);

  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        total_weeks: snapshot.length,
        total_sessions: snapshot.reduce((s, w) => s + w.sessions.length, 0),
        total_overridden_sessions: overrides.length,
        weeks: snapshot,
      },
      null,
      2,
    ),
    "utf8",
  );

  // ── Markdown digest of edits only ──────────────────────────────────
  const mdParts: string[] = [];
  mdParts.push(`# SRXFit — Ediciones del plan\n`);
  mdParts.push(`Exportado: ${new Date().toLocaleString("es-EC")}\n`);
  mdParts.push(`Total de sesiones editadas: **${overrides.length}**\n`);
  mdParts.push(`\n---\n`);

  // Pattern stats
  const patternCount: Record<string, number> = {};
  const phaseCount: Record<string, number> = {};
  const dayCount: Record<string, number> = {};
  const blockEditCount = { activacion: 0, fuerza: 0, acondicionamiento: 0, regulacion: 0, coachNotes: 0 };
  const editorCount: Record<string, number> = {};

  for (const week of snapshot) {
    for (const s of week.sessions) {
      if (!s.override) continue;
      patternCount[s.pattern] = (patternCount[s.pattern] ?? 0) + 1;
      phaseCount[week.phase] = (phaseCount[week.phase] ?? 0) + 1;
      dayCount[s.day_name_es] = (dayCount[s.day_name_es] ?? 0) + 1;
      if (s.override.activacionMd) blockEditCount.activacion++;
      if (s.override.fuerzaMd) blockEditCount.fuerza++;
      if (s.override.acondicionamientoMd) blockEditCount.acondicionamiento++;
      if (s.override.regulacionMd) blockEditCount.regulacion++;
      if (s.override.coachNotesMd) blockEditCount.coachNotes++;
      const who = s.override.updatedBy ?? "—";
      editorCount[who] = (editorCount[who] ?? 0) + 1;
    }
  }

  mdParts.push(`## Patrones observados\n`);
  mdParts.push(`**Por bloque editado:**`);
  for (const [k, v] of Object.entries(blockEditCount)) {
    mdParts.push(`- ${k}: ${v}`);
  }
  mdParts.push(`\n**Por patrón motor:**`);
  for (const [k, v] of Object.entries(patternCount).sort((a, b) => b[1] - a[1])) {
    mdParts.push(`- ${k}: ${v}`);
  }
  mdParts.push(`\n**Por fase del plan:**`);
  for (const [k, v] of Object.entries(phaseCount).sort((a, b) => b[1] - a[1])) {
    mdParts.push(`- ${k}: ${v}`);
  }
  mdParts.push(`\n**Por día de la semana:**`);
  for (const [k, v] of Object.entries(dayCount).sort((a, b) => b[1] - a[1])) {
    mdParts.push(`- ${k}: ${v}`);
  }
  mdParts.push(`\n**Por editor:**`);
  for (const [k, v] of Object.entries(editorCount).sort((a, b) => b[1] - a[1])) {
    mdParts.push(`- ${k}: ${v}`);
  }
  mdParts.push(`\n---\n`);

  // Per-session detail
  mdParts.push(`## Sesiones editadas — detalle\n`);
  for (const week of snapshot) {
    const editedInWeek = week.sessions.filter((s) => s.override);
    if (editedInWeek.length === 0) continue;
    mdParts.push(`\n### Semana ${week.week_number} — ${week.phase} (Bloque ${week.block} · ${week.block_emphasis})\n`);
    if (week.week_summary) mdParts.push(`*${week.week_summary}*\n`);
    for (const s of editedInWeek) {
      mdParts.push(`\n#### ${s.day_name_es} (día ${s.day_index}) — ${s.pattern}\n`);
      if (s.override!.updatedAt) {
        mdParts.push(`_Editado: ${new Date(s.override!.updatedAt).toLocaleDateString("es-EC")} por ${s.override!.updatedBy ?? "—"}_\n`);
      }
      const blocks: Array<[string, string | null]> = [
        ["① Activación", s.override!.activacionMd],
        ["② Fuerza", s.override!.fuerzaMd],
        ["③ Acondicionamiento", s.override!.acondicionamientoMd],
        ["④ Regulación", s.override!.regulacionMd],
        ["Nota para el coach", s.override!.coachNotesMd],
      ];
      for (const [label, content] of blocks) {
        if (!content) continue;
        mdParts.push(`\n**${label}**\n`);
        mdParts.push(content);
        mdParts.push("");
      }
    }
  }

  writeFileSync(mdPath, mdParts.join("\n"), "utf8");

  console.log(`✓ JSON snapshot:  ${jsonPath}`);
  console.log(`✓ MD digest:      ${mdPath}`);
  console.log(`\nResumen:`);
  console.log(`  Sesiones editadas: ${overrides.length}`);
  console.log(`  Bloques tocados:   Activación ${blockEditCount.activacion} · Fuerza ${blockEditCount.fuerza} · Acond. ${blockEditCount.acondicionamiento} · Regul. ${blockEditCount.regulacion} · Coach notes ${blockEditCount.coachNotes}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
