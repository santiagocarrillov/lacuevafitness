/**
 * SRXFIT — Orquestación del generador de rutinas.
 * Flujo: construir prompt → llamar a Claude → validar con Zod → linter de variedad (R1)
 *        + linter del método v3 (R7–R12) → si falla, reintentar con feedback (auto-corrección). "Coach-proof" aplicado a la IA.
 *
 * Sin dependencias nuevas: usa fetch contra la Messages API. Requiere ANTHROPIC_API_KEY.
 */
import { SYSTEM_PROMPT } from "./system-prompt";
import { weekSchema, type Week } from "./schema";
import { lintWeekVariety } from "./variety-linter";
import { lintWeekMethod } from "./method-linter";

export interface GenerateWeekInput {
  weekNumber: number;          // corre de bloque en bloque
  phase: Week["phase"];
  blockEmphasis: string;       // ej. "Hipertrofia"
  rotationKey: Week["rotationKey"]; // "1-2" | "3-4" | "5-6" | "7-8" | "9"
  isTestWeek: boolean;
  memberLevelMix?: string;     // ej. "mayoría N2, algunos N1"
  sede?: "Fitness Center" | "Xtreme";
  notes?: string;              // contexto extra del coach
}

const MODEL = "claude-sonnet-4-5";
const MAX_ATTEMPTS = 3;

function buildUserPrompt(input: GenerateWeekInput, feedback?: string): string {
  const base = `Programa la SEMANA ${input.weekNumber} (fase ${input.phase}, énfasis ${input.blockEmphasis}, rotación ${input.rotationKey}, ${input.isTestWeek ? "ES" : "NO es"} semana de test).
Sede: ${input.sede ?? "ambas"}. Nivel: ${input.memberLevelMix ?? "mixto N1–N3"}.
${input.notes ? `Notas del coach: ${input.notes}` : ""}
Devuelve el objeto Week en JSON (5 días + sábado), respetando TODAS las reglas duras.`;
  if (!feedback) return base;
  return `${base}

⚠️ El intento anterior no pasó la validación:
${feedback}
Corrige cada punto sin romper las demás reglas duras y vuelve a generar la semana completa.`;
}

async function callClaude(userPrompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(raw.slice(start, end + 1));
}

export interface GenerateResult {
  week: Week;
  attempts: number;
}

/** Genera una semana válida (schema + variedad + método v3) o lanza tras MAX_ATTEMPTS. */
export async function generateWeek(input: GenerateWeekInput): Promise<GenerateResult> {
  let feedback: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const text = await callClaude(buildUserPrompt(input, feedback));
    let parsed: Week;
    try {
      parsed = weekSchema.parse(extractJson(text));
    } catch (e) {
      feedback = `El JSON no cumplió el schema: ${(e as Error).message}`;
      continue;
    }
    const violations = [...lintWeekVariety(parsed), ...lintWeekMethod(parsed)];
    if (violations.length === 0) return { week: parsed, attempts: attempt };
    feedback = violations.map((v) => `- ${v.detail}`).join("\n");
  }
  throw new Error(`No se logró una semana válida tras ${MAX_ATTEMPTS} intentos. Último feedback:\n${feedback}`);
}
