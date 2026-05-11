// Convert SRXFit block objects to markdown for editing, and back to React for display.

export function activacionToMd(data: unknown): string {
  const d = data as {
    duration_min?: number;
    exercises?: string[];
    mobility?: string[];
    rounds_format?: string;
    rounds_content?: string[];
    cardio_options?: { primary?: string; alternatives?: string[] };
    rules?: string | string[];
  };
  const lines: string[] = [];
  if (d.duration_min) lines.push(`# Activación (${d.duration_min} min)`, "");
  if (d.exercises?.length) {
    for (const ex of d.exercises) lines.push(`- ${ex}`);
    lines.push("");
  }
  if (d.mobility?.length) {
    lines.push("**Movilidad:**");
    for (const m of d.mobility) lines.push(`- ${m}`);
    lines.push("");
  }
  if (d.rounds_format) {
    lines.push(`**${d.rounds_format}:**`);
    if (d.rounds_content?.length) for (const r of d.rounds_content) lines.push(`- ${r}`);
    lines.push("");
  }
  if (d.cardio_options) {
    const alts = d.cardio_options.alternatives?.length
      ? ` · alternativas: ${d.cardio_options.alternatives.join(" / ")}`
      : "";
    lines.push(`**Cardio:** ${d.cardio_options.primary ?? ""}${alts}`, "");
  }
  if (d.rules) {
    lines.push("**Reglas:**");
    const rules = Array.isArray(d.rules) ? d.rules : [d.rules];
    for (const r of rules) lines.push(`- ${r}`);
  }
  return lines.join("\n").trim();
}

export function fuerzaToMd(data: unknown): string {
  const d = data as {
    duration_min?: number;
    main_exercise?: { name: string; scheme: string };
    scaling?: { N1?: string; N2?: string; N3?: string };
    stations?: Array<{ name?: string; reps?: string; muscle?: string; focus?: string; exercise?: string; pattern?: string; note?: string }>;
    stations_protocol?: string;
    format?: string;
    notes?: string;
    coach_note?: string;
    tests?: Array<{ name: string; protocol?: string; warmup?: string; wod?: string; measurement?: string; vo2_formula?: string; scaling?: string; test_protocol?: string; estimation?: string }>;
    tests_fitness?: Array<{ name: string; protocol?: string; warmup?: string }>;
    alternative_xtreme?: string;
  };
  const lines: string[] = [];
  if (d.duration_min) lines.push(`# Fuerza (${d.duration_min} min)`, "");
  if (d.format && !d.main_exercise) lines.push(`**${d.format}**`, "");
  if (d.main_exercise) {
    lines.push(`**Ejercicio principal:** ${d.main_exercise.name}`);
    lines.push(`Esquema: ${d.main_exercise.scheme}`, "");
  }
  if (d.scaling) {
    lines.push("**Scaling:**");
    if (d.scaling.N1) lines.push(`- N1: ${d.scaling.N1}`);
    if (d.scaling.N2) lines.push(`- N2: ${d.scaling.N2}`);
    if (d.scaling.N3) lines.push(`- N3: ${d.scaling.N3}`);
    lines.push("");
  }
  if (d.stations?.length && !d.tests) {
    lines.push("**Estaciones:**");
    if (d.stations_protocol) lines.push(`_${d.stations_protocol}_`);
    for (const s of d.stations) {
      const parts = [s.name ?? s.exercise ?? ""];
      if (s.reps) parts.push(`— ${s.reps}`);
      if (s.focus ?? s.muscle) parts.push(`(${s.focus ?? s.muscle})`);
      if (s.pattern) parts.push(`[${s.pattern}]`);
      if (s.note) parts.push(`· ${s.note}`);
      lines.push(`- ${parts.join(" ")}`);
    }
    lines.push("");
  }
  if (d.tests?.length) {
    lines.push("**Tests de re-evaluación:**");
    for (const t of d.tests) {
      lines.push(`- **${t.name}**`);
      if (t.warmup) lines.push(`  - Calentamiento: ${t.warmup}`);
      if (t.protocol ?? t.test_protocol) lines.push(`  - Protocolo: ${t.protocol ?? t.test_protocol}`);
      if (t.wod) lines.push(`  - WOD: ${t.wod}`);
      if (t.measurement) lines.push(`  - Medición: ${t.measurement}`);
      if (t.vo2_formula) lines.push(`  - ${t.vo2_formula}`);
      if (t.estimation) lines.push(`  - ${t.estimation}`);
      if (t.scaling) lines.push(`  - Scaling: ${t.scaling}`);
    }
    lines.push("");
  }
  if (d.tests_fitness?.length) {
    lines.push("**La Cueva Fitness Center:**");
    for (const t of d.tests_fitness) {
      lines.push(`- **${t.name}**`);
      if (t.warmup) lines.push(`  - ${t.warmup}`);
      if (t.protocol) lines.push(`  - ${t.protocol}`);
    }
    if (d.alternative_xtreme) lines.push(`Xtreme: ${d.alternative_xtreme}`);
    lines.push("");
  }
  const note = d.coach_note ?? d.notes;
  if (note) lines.push(`**Coach note:** ${note}`);
  return lines.join("\n").trim();
}

export function acondicionamientoToMd(data: unknown): string {
  const d = data as {
    duration_min?: number;
    format?: string;
    zone?: string;
    description?: string;
    scaling?: string;
    objective?: string;
  };
  const lines: string[] = [];
  if (d.duration_min) lines.push(`# Acondicionamiento (${d.duration_min} min)`, "");
  if (d.format || d.zone) {
    const head = [d.format, d.zone].filter(Boolean).join(" · ");
    lines.push(`**${head}**`, "");
  }
  if (d.description) lines.push(d.description, "");
  if (d.objective) lines.push(`_${d.objective}_`, "");
  if (d.scaling) lines.push(`**Scaling:** ${d.scaling}`);
  return lines.join("\n").trim();
}

export function regulacionToMd(data: unknown): string {
  const d = data as {
    duration_min?: number;
    mobility?: string[] | { duration_min?: number; exercises?: string[] };
    breathing?: { technique?: string; duration_min?: number; instructions?: string };
    closing?: string | { duration_seconds?: string | number; message?: string };
  };
  const lines: string[] = [];
  if (d.duration_min) lines.push(`# Regulación (${d.duration_min} min)`, "");

  let mob: string[] = [];
  if (Array.isArray(d.mobility)) mob = d.mobility;
  else if (d.mobility && typeof d.mobility === "object" && Array.isArray(d.mobility.exercises))
    mob = d.mobility.exercises;
  if (mob.length) {
    lines.push("**Movilidad regenerativa:**");
    for (const m of mob) lines.push(`- ${m}`);
    lines.push("");
  }
  if (d.breathing) {
    const dur = d.breathing.duration_min ? ` (${d.breathing.duration_min} min)` : "";
    lines.push(`**Respiración${dur}:**`);
    if (d.breathing.technique) lines.push(`- ${d.breathing.technique}`);
    if (d.breathing.instructions) lines.push(`- ${d.breathing.instructions}`);
    lines.push("");
  }
  let closingText: string | null = null;
  if (typeof d.closing === "string") closingText = d.closing;
  else if (d.closing && typeof d.closing === "object" && d.closing.message) closingText = d.closing.message;
  if (closingText) lines.push(`**Cierre:** ${closingText}`);
  return lines.join("\n").trim();
}

// ─── Markdown → React (very small subset) ────────────────────────────
//
// Supports:
//   # heading        → bold paragraph (treated as section header)
//   **bold**         → <strong>
//   _italic_         → <em>
//   - / * bullet     → bullet item
//   blank line       → paragraph break

import type { ReactNode } from "react";

function renderInline(text: string, keyBase: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Tokenize **bold** and _italic_
  const regex = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(regex)) {
    if (m.index! > last) parts.push(text.slice(last, m.index!));
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(<strong key={`${keyBase}-${i++}`}>{tok.slice(2, -2)}</strong>);
    else parts.push(<em key={`${keyBase}-${i++}`}>{tok.slice(1, -1)}</em>);
    last = m.index! + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function MarkdownText({ source }: { source: string }) {
  const lines = source.split("\n");
  const out: ReactNode[] = [];
  let bullets: string[] | null = null;
  let key = 0;

  function flushBullets() {
    if (!bullets) return;
    const items = bullets;
    out.push(
      <ul key={key++} className="list-disc list-inside space-y-1 text-sm">
        {items.map((b, i) => (
          <li key={i}>{renderInline(b, `b-${i}`)}</li>
        ))}
      </ul>,
    );
    bullets = null;
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      bullets ??= [];
      bullets.push(line.slice(2));
      continue;
    }
    flushBullets();
    if (line.startsWith("# ")) {
      out.push(
        <p key={key++} className="text-sm font-semibold">
          {renderInline(line.slice(2), `h-${key}`)}
        </p>,
      );
    } else {
      out.push(
        <p key={key++} className="text-sm">
          {renderInline(line, `p-${key}`)}
        </p>,
      );
    }
  }
  flushBullets();
  return <div className="space-y-1.5">{out}</div>;
}
