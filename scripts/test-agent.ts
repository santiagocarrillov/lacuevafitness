/**
 * Dry-run the WhatsApp sales agent WITHOUT sending anything or touching the DB.
 * This is the "modo borrador" for validating tone on real message shapes before
 * we wire auto-send.
 *
 * Usage:
 *   npx tsx scripts/test-agent.ts "Información"
 *   npx tsx scripts/test-agent.ts            # runs the built-in FAQ suite
 *
 * Requires ANTHROPIC_API_KEY in the environment.
 */

import { runAgent, type AgentTurn } from "../src/lib/whatsapp/agent";

const SUITE: string[] = [
  "Información",
  "¿Qué ofrecen? ¿Es como CrossFit?",
  "¿Dónde están ubicados?",
  "¿Qué horarios tienen?",
  "Si no me interesa la evaluación, ¿igual puedo entrenar?",
  "Vi su publicidad pero otros gimnasios cobran $25 y me dijeron que su mensualidad es $60, se sale de mi presupuesto",
  "Quiero hablar con una persona por favor",
];

async function runOne(userMessage: string) {
  const history: AgentTurn[] = [{ role: "user", text: userMessage }];
  const res = await runAgent(history, { leadName: null });
  console.log("\n─────────────────────────────────────────────");
  console.log("👤 LEAD:", userMessage);
  console.log("🤖 AGENTE:", res.reply);
  console.log(
    `   ↳ intent=${res.intent} · sede=${res.sede} · objetivo=${res.objetivo ?? "—"} · horario=${res.horarioPreferido ?? "—"} · handoff=${res.handoff} · stage=${res.suggestedStage}`,
  );
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Falta ANTHROPIC_API_KEY en el entorno.");
    process.exit(1);
  }
  const arg = process.argv.slice(2).join(" ").trim();
  const messages = arg ? [arg] : SUITE;
  for (const m of messages) {
    try {
      await runOne(m);
    } catch (err) {
      console.error(`Error con "${m}":`, err instanceof Error ? err.message : err);
    }
  }
  console.log("\n─────────────────────────────────────────────\n");
}

main();
