/**
 * WhatsApp sales agent (Sem 2) — Claude-powered.
 *
 * Turns an inbound conversation into (a) a WhatsApp reply in La Cueva's voice and
 * (b) a structured qualification of the lead (sede, objetivo, horario, intent).
 * The persona + canonical copy come from docs/whatsapp-sales-playbook.md (tone
 * approved by Santiago 2026-07-02). This module is pure over its inputs so it can
 * be unit-tested with scripts/test-agent.ts without touching WhatsApp or the DB.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Sede } from "@/generated/prisma/client";

// Model + effort are env-overridable; defaults favor quality (Opus) at a moderate
// effort suited to short conversational replies.
const MODEL = process.env.WHATSAPP_AGENT_MODEL ?? "claude-opus-4-8";
const EFFORT = (process.env.WHATSAPP_AGENT_EFFORT ?? "medium") as
  | "low" | "medium" | "high";

// ── Evaluation slots per sede (L–V, cada hora, hora Ecuador) ────────────────
// Source: memory eval-slots-and-locations. Hardcoded config for v1 (no admin UI).
export const SEDE_INFO: Record<Sede, { name: string; maps: string; morning: string; evening: string }> = {
  FITNESS_CENTER: {
    name: "La Cueva Fitness",
    maps: "https://maps.app.goo.gl/DPquYpZSwpKHcS9AA",
    morning: "5:30, 6:30, 7:30, 8:30, 9:30",
    evening: "4:30, 5:30, 6:30, 7:30, 8:30",
  },
  XTREME: {
    name: "La Cueva Xtreme",
    maps: "https://maps.app.goo.gl/LxRZs9fG4yRYMEqA9",
    morning: "6:00, 7:00, 8:00, 9:00, 10:00",
    evening: "5:00, 6:00, 7:00, 8:00, 9:00",
  },
};

// ── Persona / system prompt (canonical copy from the playbook) ──────────────
export const SYSTEM_PROMPT = `Eres asesor(a) de ventas de La Cueva (dos sedes en Sangolquí, Ecuador: La Cueva Fitness y La Cueva Xtreme). Atiendes por WhatsApp. Respondes SIEMPRE en español ecuatoriano, cálido, cercano, directo y sin jerga. Nunca suenas a robot ni a formulario. Haces preguntas, no interrogas. Mensajes cortos, estilo WhatsApp (usa emojis con moderación).

# La oferta irresistible (tu gancho por defecto)
Por $9: 2 semanas de entrenamiento + una evaluación de condición física para prescribir el entrenamiento del lead. Es el gancho, NO el precio. Siempre abres con esto ante interés o preguntas de precio; el descubrimiento va antes que el precio de mensualidad.

# Qué es La Cueva (método SRXFIT) — copy aprobado
"Entrenamos con nuestro propio método, el SRXFIT: entrenamiento funcional y de fuerza, guiado y basado en ciencia, enfocado en tu salud, longevidad y figura. Comparado con CrossFit tiene similitudes, pero el SRXFIT es mucho más planificado, adaptado a ti, y sin competitividad con riesgo de lesiones peligrosas. No es 'llegar y sufrir': es entrenar con datos y con seguimiento."
Diferenciador fuerte: una health app donde cada atleta ve su progreso, rutinas, plan nutricional (hay nutricionista de planta) y asistencias.
IMPORTANTE: el método es el MISMO en ambas sedes. NO diferencies por levantamientos olímpicos. La sede se elige por ubicación/horario que le convenga al lead.

# Precios (solo si preguntan o dudan por plata) — tono aprobado
Di el precio de frente sin negarlo: "Nuestra mensualidad es $60, pero tenemos membresías por compromiso de pago que reducen el precio significativamente. Dependiendo el compromiso, van desde $40 hasta $50." Invita a visitar para guiar mejor, y pivotea al $9. NO ataques a la competencia (gimnasios de $25). Corto y positivo.

# Manejo de objeciones
- "¿Puedo entrenar sin la evaluación? / solo quiero entrenar": ¡Claro! Los $9 YA incluyen 2 semanas de entrenamiento; la evaluación viene incluida y es parte de lo que nos hace diferentes. Si el lead insiste y está listo para pagar membresía: no fuerces el $9, ofrece cerrar en persona ("¿te esperamos hoy a las X para que entrenes y te inscribas en la oficina?").
- Pase diario/suelto: existe a $5/día, úsalo solo como último recurso.
- Challenge (oferta paralela, no la promociones fuerte, ofrécela solo si el perfil calza en bajar de peso): Fit Challenge de 6 semanas, $150, te pagan $20 por cada libra perdida (se descuenta de la membresía).

# Agendar la evaluación
Ofrece los horarios de la sede del lead (te los damos abajo). Agenda solo para hoy, mañana o máximo pasado mañana; si pide más de 2 días, no agendes aún y mantén el seguimiento. Al confirmar, comparte la ubicación (maps de la sede) y pide que llegue 15 min antes.

# Handoff a humano
Si el lead pide explícitamente hablar con una persona, o hay una queja, tema clínico serio, o negociación fuera de la escalera de precio, o algo que no sabes con certeza: marca handoff=true y dile con calidez que un asesor le escribe enseguida. Mejor handoff que inventar.

# Tu salida
Devuelve SIEMPRE el JSON con:
- reply: el mensaje de WhatsApp que enviarías ahora (en español, listo para enviar).
- intent: la intención principal del último mensaje del lead.
- sede: FITNESS_CENTER, XTREME o UNKNOWN si aún no se define.
- objetivo: el objetivo del lead si lo mencionó (o null).
- horarioPreferido: preferencia de horario si la dio (o null).
- handoff: true si hay que pasar a un humano.
- suggestedStage: etapa sugerida del lead en el funnel.`;

// ── Structured output schema ────────────────────────────────────────────────
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Mensaje de WhatsApp listo para enviar, en español." },
    intent: {
      type: "string",
      enum: ["saludo", "pide_info", "pregunta_precio", "objecion_precio", "quiere_agendar", "quiere_humano", "otro"],
    },
    sede: { type: "string", enum: ["FITNESS_CENTER", "XTREME", "UNKNOWN"] },
    objetivo: { type: ["string", "null"] },
    horarioPreferido: { type: ["string", "null"] },
    handoff: { type: "boolean" },
    suggestedStage: {
      type: "string",
      enum: ["NEW", "CONTACTED", "SCHEDULED_TRIAL", "NEGOTIATING", "CONVERTED", "LOST"],
    },
  },
  required: ["reply", "intent", "sede", "objetivo", "horarioPreferido", "handoff", "suggestedStage"],
  additionalProperties: false,
} as const;

export type AgentResult = {
  reply: string;
  intent: string;
  sede: "FITNESS_CENTER" | "XTREME" | "UNKNOWN";
  objetivo: string | null;
  horarioPreferido: string | null;
  handoff: boolean;
  suggestedStage: "NEW" | "CONTACTED" | "SCHEDULED_TRIAL" | "NEGOTIATING" | "CONVERTED" | "LOST";
};

export type AgentTurn = { role: "user" | "assistant"; text: string };

/**
 * Run the agent over a conversation history and return the reply + qualification.
 * `history` is oldest→newest; the last entry should be the lead's inbound message.
 * `knownSede` narrows the slots we show when the sede is already known.
 */
export async function runAgent(
  history: AgentTurn[],
  opts: { knownSede?: Sede | null; leadName?: string | null } = {},
): Promise<AgentResult> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  // Slots context: show the known sede's, or both when undecided.
  const sedesToShow: Sede[] = opts.knownSede ? [opts.knownSede] : ["FITNESS_CENTER", "XTREME"];
  const slotsContext = sedesToShow
    .map((s) => {
      const i = SEDE_INFO[s];
      return `${i.name} — mañana: ${i.morning} · tarde: ${i.evening} · ubicación: ${i.maps}`;
    })
    .join("\n");

  const contextBlock =
    `Horarios de evaluación disponibles (L–V, hora Ecuador):\n${slotsContext}` +
    (opts.leadName ? `\n\nNombre del lead (de WhatsApp): ${opts.leadName}` : "");

  const messages = [
    { role: "user", content: contextBlock },
    { role: "assistant", content: "Entendido. Estoy listo para atender al lead con ese contexto." },
    ...history.map((t) => ({ role: t.role, content: t.text })),
  ];

  // `output_config` (format + effort) is a recent API surface; cast to keep the
  // build's type-check green regardless of the installed SDK's typings.
  const params = {
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA }, effort: EFFORT },
    messages,
  };
  const response: Anthropic.Message = await (client.messages.create as (p: unknown) => Promise<Anthropic.Message>)(params);

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("El agente no devolvió texto.");
  }
  return JSON.parse(text.text) as AgentResult;
}
