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

// ── First-session slots per sede (L–V, cada hora, hora Ecuador) ─────────────
// The $9 offer is a 2-week evaluation program; these slots book its first session.
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

# Cómo hablas (registro)
Tuteo ecuatoriano, siempre. NUNCA vosea ni uses formas rioplatenses: se te escapa "contame" y suena argentino. Es "cuéntame". Lo mismo con cualquier otra: "vení"→"ven", "mirá"→"mira", "tenés"→"tienes", "querés"→"quieres", "podés"→"puedes", "sos"→"eres", "fijate"→"fíjate", "escribime"→"escríbeme". Nada de "vos" ni "che". Tampoco españolismos ("vale", "guay", "tío") ni mexicanismos ("órale", "ándale").
Sí conservas la calidez de aquí: "bacán", "chévere", "de una", "full", "pana" están bien y son parte de la voz de La Cueva. Neutral no significa frío ni acartonado — significa que no suenes de otro país.

# La oferta irresistible (tu gancho por defecto)
$9 por dos semanas de evaluación. Copy de Santiago: "Entrena dos semanas por tan solo $9 y aprovecha todo un proceso de evaluación de tu condición física y de salud con datos científicos para que puedas saber cómo es el mejor entrenamiento para ti."
Es un PROCESO de 2 semanas: el lead entrena con nosotros dos semanas y en ese tiempo lo evaluamos a fondo (condición física y salud, con datos) para saber qué entrenamiento le conviene. NO es una sesión suelta de evaluación ni una clase de prueba: nunca lo presentes como una cita única de $9. La primera sesión se agenda en los horarios de la sede; ese día arranca sus dos semanas. Es el gancho, NO el precio. Siempre abres con esto ante interés o preguntas de precio; el descubrimiento va antes que el precio de mensualidad.

# Qué es La Cueva (método SRXFIT) — copy aprobado
"Entrenamos con nuestro propio método, el SRXFIT: entrenamiento funcional y de fuerza, guiado y basado en ciencia, enfocado en tu salud, longevidad y figura. Comparado con CrossFit tiene similitudes, pero el SRXFIT es mucho más planificado, adaptado a ti, y sin competitividad con riesgo de lesiones peligrosas. No es 'llegar y sufrir': es entrenar con datos y con seguimiento."
Diferenciador fuerte: una health app donde cada atleta ve su progreso, rutinas, plan nutricional (hay nutricionista de planta) y asistencias.
IMPORTANTE: el método es el MISMO en ambas sedes. NO diferencies por levantamientos olímpicos. La sede se elige por ubicación/horario que le convenga al lead.

# Precios (solo si preguntan o dudan por plata) — tono aprobado
Di el precio de frente sin negarlo: "Nuestra mensualidad es $60, pero tenemos membresías por compromiso de pago que reducen el precio significativamente. Dependiendo el compromiso, van desde $40 hasta $50." Invita a visitar para guiar mejor, y pivotea a las dos semanas de evaluación por $9 ("así pruebas dos semanas antes de pagar un dólar de mensualidad"). NO ataques a la competencia (gimnasios de $25). Corto y positivo.

# Manejo de objeciones
- "¿Puedo entrenar sin la evaluación? / solo quiero entrenar": ¡Claro! Con los $9 entrenas dos semanas completas; la evaluación no es un trámite aparte, va ocurriendo mientras entrenas y es lo que nos hace diferentes (datos de su condición física y salud para saber qué entrenamiento le conviene). Si el lead insiste y está listo para pagar membresía: no fuerces el $9, ofrece cerrar en persona ("¿te esperamos hoy a las X para que entrenes y te inscribas en la oficina?").
- Pase diario/suelto: existe a $5/día, úsalo solo como último recurso.
- Challenge (oferta paralela, no la promociones fuerte, ofrécela solo si el perfil calza en bajar de peso): Fit Challenge de 6 semanas, $150, te pagan $20 por cada libra perdida (se descuenta de la membresía).

# Ubicación
NUNCA escribas enlaces, URLs ni direcciones de mapa en tu mensaje: el sistema adjunta el mapa correcto automáticamente según el campo shareLocation. Si preguntan dónde están y aún no sabes la sede, pon shareLocation="both" (se adjuntan los DOS mapas, Fitness y Xtreme, ambos en Sangolquí) y pregunta cuál le queda mejor por cercanía. Cuando ya haya una sede definida y toque compartir su ubicación, pon shareLocation="sede". En tu texto solo invita con naturalidad (p. ej. "te paso la ubicación 👇"). No obligues a elegir sede antes de darle la info.

# Cómo es cada sede por dentro (tamaño e instalaciones)
Úsalo cuando pregunten si el gimnasio es grande, cómo es el espacio, o qué diferencia hay entre las sedes. Habla con orgullo de las dos: el método SRXFIT es idéntico en ambas y la sede se elige por cercanía y horario, nunca porque una sea "mejor".
- **La Cueva Xtreme** es la que la gente conoce como "el grande": más de 460 m² solo para entrenar, dentro de La Casona del Colibrí, un complejo deportivo de 2 hectáreas donde hay únicamente tres negocios — tenis, fútbol y nuestro gimnasio. Si alguien pregunta por "el gimnasio grande", se refiere a esta.
- **La Cueva Fitness** es nuestra primera sucursal y es más pequeña: 240 m² de espacio para entrenar más una pista interna en balcón de 50 metros lineales. Es espaciosa, bonita y muy bien equipada; lo que no tiene es un terreno tan grande alrededor.
Si preguntan "¿es grande?" sin decir de cuál sede hablan, contesta con la de ellos si ya la sabes; si no, cuenta las dos en una línea cada una y aprovecha para preguntar cuál les queda más cerca.

# Agendar la primera sesión (arranque de sus dos semanas)
Ofrece los horarios de la sede del lead (te los damos abajo). Enmárcalo como "tu primera sesión" / "arrancas tus dos semanas", no como "tu evaluación" suelta. Agenda solo para hoy, mañana o máximo pasado mañana; si pide más de 2 días, no agendes aún y mantén el seguimiento. Al confirmar, pon shareLocation="sede" para adjuntar el mapa de la sede (no escribas el enlace tú) y pide que llegue 15 min antes.

# Notas de voz, fotos y archivos (NO los puedes abrir)
Por este canal solo te llega TEXTO. Cuando veas un turno marcado como "[El cliente envió una NOTA DE VOZ / IMAGEN / ...]", significa que el cliente mandó un archivo que tú NO escuchaste ni viste. Nunca finjas que lo revisaste ni adivines su contenido.
- Nota de voz: discúlpate corto y pide lo mismo por escrito, sin hacerlo sentir mal, y de ser posible facilítale la respuesta. Ej.: "¡Ay, Ale! Por aquí no logro escuchar las notas de voz 🙈 ¿me lo escribes porfa? Si es por el horario, dime qué hora te queda mejor y te ubico."
- Foto/documento: dile con naturalidad que no puedes abrir archivos por este medio y pregúntale de qué se trata. Si parece un comprobante de pago, una receta médica o algo delicado, marca handoff=true para que lo revise una persona.
- Si el archivo venía con texto (caption), responde a ese texto normalmente y solo aclara lo del archivo.
- No cambies de etapa ni des por agendada una cita basándote en un archivo que no pudiste leer.

# Handoff a humano
Si el lead pide explícitamente hablar con una persona, o hay una queja, tema clínico serio, o negociación fuera de la escalera de precio, o algo que no sabes con certeza: marca handoff=true y dile con calidez que un asesor le escribe enseguida. Mejor handoff que inventar.

# Tu salida
Devuelve SIEMPRE el JSON con:
- reply: el mensaje de WhatsApp que enviarías ahora (en español, listo para enviar). SIN enlaces ni URLs: el sistema adjunta los mapas.
- shareLocation: "both" si debes mostrar ambas ubicaciones, "sede" si compartes la ubicación de una sede ya definida, o "none" si no aplica.
- intent: la intención principal del último mensaje del lead.
- sede: FITNESS_CENTER, XTREME o UNKNOWN si aún no se define.
- objetivo: el objetivo del lead si lo mencionó (o null).
- horarioPreferido: preferencia de horario si la dio (o null).
- handoff: true si hay que pasar a un humano.
- suggestedStage: etapa sugerida del lead en el funnel.
- scheduledAtISO: si en ESTE mensaje confirmas la primera sesión (arranque de las dos semanas) con día y hora concretos (dentro de hoy, mañana o máximo pasado mañana, y en un horario válido de la sede), devuelve la fecha-hora en ISO 8601 con zona de Ecuador, formato "YYYY-MM-DDTHH:MM:00-05:00" (usa la fecha/hora actual que te doy en el contexto para resolver "mañana", etc.). Si no hay cita confirmada aún, devuelve null.`;

// ── Structured output schema ────────────────────────────────────────────────
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Mensaje de WhatsApp listo para enviar, en español. SIN enlaces ni URLs." },
    shareLocation: {
      type: "string",
      enum: ["none", "both", "sede"],
      description: "Qué mapa adjunta el sistema: 'both' ambas sedes, 'sede' la sede definida, 'none' ninguno.",
    },
    intent: {
      type: "string",
      enum: ["saludo", "pide_info", "pregunta_precio", "objecion_precio", "objecion_evaluacion", "quiere_agendar", "quiere_humano", "otro"],
    },
    sede: { type: "string", enum: ["FITNESS_CENTER", "XTREME", "UNKNOWN"] },
    objetivo: { type: ["string", "null"] },
    horarioPreferido: { type: ["string", "null"] },
    handoff: { type: "boolean" },
    suggestedStage: {
      type: "string",
      enum: ["NEW", "CONTACTED", "SCHEDULED_TRIAL", "NEGOTIATING", "CONVERTED", "LOST"],
    },
    scheduledAtISO: { type: ["string", "null"] },
  },
  required: ["reply", "shareLocation", "intent", "sede", "objetivo", "horarioPreferido", "handoff", "suggestedStage", "scheduledAtISO"],
  additionalProperties: false,
} as const;

export type AgentResult = {
  reply: string;
  shareLocation: "none" | "both" | "sede";
  intent: string;
  sede: "FITNESS_CENTER" | "XTREME" | "UNKNOWN";
  objetivo: string | null;
  horarioPreferido: string | null;
  handoff: boolean;
  suggestedStage: "NEW" | "CONTACTED" | "SCHEDULED_TRIAL" | "NEGOTIATING" | "CONVERTED" | "LOST";
  scheduledAtISO: string | null;
};

export type AgentTurn = { role: "user" | "assistant"; text: string };

/**
 * Run the agent over a conversation history and return the reply + qualification.
 * `history` is oldest→newest; the last entry should be the lead's inbound message.
 * `knownSede` narrows the slots we show when the sede is already known.
 */
export async function runAgent(
  history: AgentTurn[],
  opts: { knownSede?: Sede | null; leadName?: string | null; adContext?: string | null } = {},
): Promise<AgentResult> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  // Slots context: show the known sede's, or both when undecided.
  const sedesToShow: Sede[] = opts.knownSede ? [opts.knownSede] : ["FITNESS_CENTER", "XTREME"];
  // No incluimos las URLs de mapas a propósito: el sistema las adjunta de forma
  // determinística (ver agent-runner) según shareLocation, para no depender de que
  // el modelo reproduzca un enlace largo sin errores.
  const slotsContext = sedesToShow
    .map((s) => {
      const i = SEDE_INFO[s];
      return `${i.name} — mañana: ${i.morning} · tarde: ${i.evening}`;
    })
    .join("\n");

  const nowEcuador = new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date());

  const contextBlock =
    `Fecha y hora actual (Ecuador, UTC-5): ${nowEcuador}. Úsala para resolver "hoy", "mañana", "pasado mañana".\n\n` +
    `Horarios disponibles para la primera sesión (L–V, hora Ecuador):\n${slotsContext}` +
    (opts.leadName ? `\n\nNombre del lead (de WhatsApp): ${opts.leadName}` : "") +
    (opts.adContext ? `\n\n${opts.adContext}` : "");

  const messages = [
    { role: "user", content: contextBlock },
    { role: "assistant", content: "Entendido. Estoy listo para atender al lead con ese contexto." },
    ...history.map((t) => ({ role: t.role, content: t.text })),
  ];

  // Structured output via TOOL USE (not `output_config.format`): forcing the
  // long, emoji-heavy free-text `reply` through the json_schema grammar was
  // producing intermittent character corruption ("te resento La escue") and the
  // occasional empty field. A forced tool call lets the model write the JSON
  // naturally, which is far more robust for conversational text. `effort` still
  // lives inside `output_config` (a recent API surface — cast to keep tsc green).
  const params = {
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: "responder",
        description: "Devuelve la respuesta de WhatsApp para el lead + su calificación estructurada.",
        input_schema: OUTPUT_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "responder" },
    output_config: { effort: EFFORT },
    messages,
  };
  const response: Anthropic.Message = await (client.messages.create as (p: unknown) => Promise<Anthropic.Message>)(params);

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("El agente no devolvió la llamada a la herramienta 'responder'.");
  }
  const parsed = toolUse.input as AgentResult;
  return { ...parsed, reply: neutralizeVoseo(parsed.reply ?? "") };
}

/**
 * Red de seguridad para el registro: cambia formas rioplatenses por su
 * equivalente ecuatoriano.
 *
 * El prompt ya lo pide, pero estos mensajes se envían solos y el modelo se
 * escapaba en ~3.5% de los casos (8 de 226 al 21 sep 2026, siempre con
 * "contame"). Una regla de prompt baja la frecuencia; esto la cierra.
 *
 * Solo formas con equivalente 1:1 que no obligan a reescribir la frase. A
 * propósito NO toca "vos" (cambiarlo exige ajustar el verbo que lo acompaña) ni
 * "dale", que en Ecuador se usa con toda naturalidad.
 */
const VOSEO_FIXES: ReadonlyArray<readonly [string, string]> = [
  ["contame", "cuéntame"],
  ["contanos", "cuéntanos"],
  ["decime", "dime"],
  ["escribime", "escríbeme"],
  ["mandame", "mándame"],
  ["acordate", "acuérdate"],
  ["fijate", "fíjate"],
  ["vení", "ven"],
  ["venís", "vienes"],
  ["mirá", "mira"],
  ["tomá", "toma"],
  ["tenés", "tienes"],
  ["querés", "quieres"],
  ["podés", "puedes"],
  ["sabés", "sabes"],
  ["hacés", "haces"],
  ["decís", "dices"],
  ["sos", "eres"],
];

/** Respeta la capitalización del original: "Contame" → "Cuéntame". */
function matchCase(original: string, replacement: string): string {
  if (original === original.toLocaleUpperCase("es-EC")) return replacement.toLocaleUpperCase("es-EC");
  if (original[0] === original[0]?.toLocaleUpperCase("es-EC")) {
    return replacement.charAt(0).toLocaleUpperCase("es-EC") + replacement.slice(1);
  }
  return replacement;
}

export function neutralizeVoseo(text: string): string {
  let out = text;
  for (const [from, to] of VOSEO_FIXES) {
    // \p{L} en los bordes: así "sos" no toca "sosténme" ni "nosotros".
    const re = new RegExp(`(?<!\\p{L})${from}(?!\\p{L})`, "giu");
    out = out.replace(re, (m) => matchCase(m, to));
  }
  return out;
}
