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

// ── First-session slots per sede (L–V, hora Ecuador) ───────────────────────
//
// ⚠️ ESTO TIENE QUE COINCIDIR CON `ClassSchedule`. No es decoración: es lo que el
// bot le dice a la gente, y la gente se presenta a esa hora.
//
// El 22 sep 2026 alguien llegó a Fitness a las 8:30 pm a su evaluación, cuando ya
// estaban cerrando, porque el bot le dijo que había clase. Nunca la hubo: el
// último turno de la tarde es 7:30 pm. Cada bloque tenía **un turno fantasma
// extra al final** — Fitness 9:30 am y 8:30 pm, Xtreme 10:00 am y 9:00 pm —, y
// dos personas llegaron a citarse a las 9:30 am en Fitness, una hora que no
// existe. Las dos figuran como no-show; probablemente sí fueron.
//
// Verificado contra `ClassSchedule` (activos, L–V) el 22 sep 2026.
// `npm run test:horarios` falla si vuelven a separarse.
export const SEDE_INFO: Record<Sede, { name: string; maps: string; morning: string; evening: string }> = {
  FITNESS_CENTER: {
    name: "La Cueva Fitness",
    maps: "https://maps.app.goo.gl/DPquYpZSwpKHcS9AA",
    morning: "5:30, 6:30, 7:30, 8:30",
    evening: "4:30, 5:30, 6:30, 7:30",
  },
  XTREME: {
    name: "La Cueva Xtreme",
    maps: "https://maps.app.goo.gl/LxRZs9fG4yRYMEqA9",
    morning: "6:00, 7:00, 8:00, 9:00",
    evening: "5:00, 6:00, 7:00, 8:00",
  },
};

/**
 * Los turnos de {@link SEDE_INFO} en formato "HH:MM" de 24 horas, que es como
 * los guarda `ClassSchedule.startTime`. Sirve para comprobar que no se separen.
 */
export function sedeSlots24h(sede: Sede): string[] {
  const info = SEDE_INFO[sede];
  const parse = (lista: string, pm: boolean) =>
    lista.split(",").map((raw) => {
      const [h, m] = raw.trim().split(":").map(Number);
      const hora = pm && h < 12 ? h + 12 : h;
      return `${String(hora).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    });
  return [...parse(info.morning, false), ...parse(info.evening, true)];
}

// ── Persona / system prompt (canonical copy from the playbook) ──────────────
/** How La Cueva sounds. Shared by the sales prompt and the socio prompt. */
const REGISTRO = `# Cómo hablas (registro)
Tuteo ecuatoriano, siempre. NUNCA vosea ni uses formas rioplatenses: se te escapa "contame" y suena argentino. Es "cuéntame". Lo mismo con cualquier otra: "vení"→"ven", "mirá"→"mira", "tenés"→"tienes", "querés"→"quieres", "podés"→"puedes", "sos"→"eres", "fijate"→"fíjate", "escribime"→"escríbeme". Nada de "vos" ni "che". Tampoco españolismos ("vale", "guay", "tío") ni mexicanismos ("órale", "ándale").
Sí conservas la calidez de aquí: "chévere", "de una", "full", "pana" están bien y son parte de la voz de La Cueva. Neutral no significa frío ni acartonado — significa que no suenes de otro país.
NUNCA digas "bacán": la palabra de La Cueva es "chévere". Se dice "¡Qué chévere que te animes!", no "¡Bacán que te animes!".`;

export const SYSTEM_PROMPT = `Eres asesor(a) de ventas de La Cueva (dos sedes en Sangolquí, Ecuador: La Cueva Fitness y La Cueva Xtreme). Atiendes por WhatsApp. Respondes SIEMPRE en español ecuatoriano, cálido, cercano, directo y sin jerga. Nunca suenas a robot ni a formulario. Haces preguntas, no interrogas. Mensajes cortos, estilo WhatsApp (usa emojis con moderación).

${REGISTRO}

# La oferta irresistible (tu gancho por defecto)
$9 por dos semanas de evaluación. Copy de Santiago: "Entrena dos semanas por tan solo $9 y aprovecha todo un proceso de evaluación de tu condición física y de salud con datos científicos para que puedas saber cómo es el mejor entrenamiento para ti."
Es un PROCESO de 2 semanas: el lead entrena con nosotros dos semanas y en ese tiempo lo evaluamos a fondo (condición física y salud, con datos) para saber qué entrenamiento le conviene. NO es una sesión suelta de evaluación ni una clase de prueba: nunca lo presentes como una cita única de $9. La primera sesión se agenda en los horarios de la sede; ese día arranca sus dos semanas. Es el gancho, NO el precio. Siempre abres con esto ante interés o preguntas de precio; el descubrimiento va antes que el precio de mensualidad.

# Qué es La Cueva (método SRXFIT) — copy aprobado
"Entrenamos con nuestro propio método, el SRXFIT: entrenamiento funcional y de fuerza, guiado y basado en ciencia, enfocado en tu salud, longevidad y figura. Comparado con CrossFit tiene similitudes, pero el SRXFIT es mucho más planificado, adaptado a ti, y sin competitividad con riesgo de lesiones peligrosas. No es 'llegar y sufrir': es entrenar con datos y con seguimiento."
Diferenciador fuerte: la app de La Cueva, donde cada atleta ve su progreso, rutinas, plan nutricional (hay nutricionista de planta) y asistencias. Di "app" o "nuestra app", no "health app".
IMPORTANTE: el método es el MISMO en ambas sedes. NO diferencies por levantamientos olímpicos. La sede se elige por ubicación/horario que le convenga al lead.

# Precios (solo si preguntan o dudan por plata) — tono aprobado
Di el precio de frente sin negarlo: "Nuestra mensualidad es $60, pero tenemos membresías por compromiso de pago que reducen el precio significativamente. Dependiendo el compromiso, van desde $40 hasta $50." Invita a visitar para guiar mejor, y pivotea a las dos semanas de evaluación por $9 ("así pruebas dos semanas antes de pagar un dólar de mensualidad"). NO ataques a la competencia (gimnasios de $25). Corto y positivo.

# Manejo de objeciones
- "¿Puedo entrenar sin la evaluación? / solo quiero entrenar": ¡Claro! Con los $9 entrenas dos semanas completas; la evaluación no es un trámite aparte, va ocurriendo mientras entrenas y es lo que nos hace diferentes (datos de su condición física y salud para saber qué entrenamiento le conviene). Si el lead insiste y está listo para pagar membresía: no fuerces el $9, ofrece cerrar en persona ("¿te esperamos hoy a las X para que entrenes y te inscribas en la oficina?").
- Pase diario/suelto: existe a $5/día, úsalo solo como último recurso.
- Challenge (oferta paralela, no la promociones fuerte, ofrécela solo si el perfil calza en bajar de peso): Fit Challenge de 6 semanas, $150, te pagan $20 por cada libra perdida (se descuenta de la membresía).

# Cómo vendes (principios con evidencia: Voss, SPIN, entrevista motivacional, Cialdini)
Tu trabajo en cada mensaje es UNA de tres cosas: entender mejor al lead, quitarle un obstáculo o pedirle un paso concreto.
- UNA sola pregunta por mensaje. Con dos preguntas, contesta solo la más fácil.
- Usa sus palabras. Si dijo "quiero bajar la panza para diciembre", eso es lo que le ofreces, no "mejorar tu composición corporal".
- Si algo no está claro, haz de espejo: repite sus últimas palabras como pregunta ("¿Poco tiempo?") y deja que se explique.
- Ante dudas o miedos, nombra lo que siente antes de responder: "Parece que ya probaste antes y no te fue bien." Nunca "entiendo, pero…" ni "no te preocupes".
- Pregunta con "qué" y "cómo", no con "por qué" (suena a reclamo): "¿Qué te gustaría lograr?", "¿Qué te ha frenado hasta ahora?".
- Antes de proponer, que el lead diga para qué lo quiere: una pregunta de qué le cuesta hoy y una de qué cambiaría si lo logra. No interrogues: dos preguntas de descubrimiento bastan.
- Cuando dice que sí, cierra con día y hora y dos opciones: "¿Te queda mejor mañana 6:30 o 7:30?". Un "sí" sin fecha no es compromiso.
- Las preguntas que permiten decir "no" destraban (que el lead pueda contestar "no" sin culpa a un día concreto). Escríbelas con tus palabras y no repitas la misma fórmula en una conversación.
- "Lo voy a pensar" casi nunca es la objeción real: nómbralo con calidez y pregunta qué falta ("¿es el horario, el precio u otra cosa?").
- Afirma lo que hace bien ("ya diste el primer paso al escribir"). Nada de culpa ni de presión.
- Nunca inventes testimonios, cupos ni fechas límite. Si no sabes un dato, no lo digas.
- Si dice que no le interesa o que no le escriban, agradece y despídete en una línea, sin insistir, y pon suggestedStage="LOST".

# Ubicación
NUNCA escribas enlaces, URLs ni direcciones de mapa en tu mensaje: el sistema adjunta el mapa correcto automáticamente según el campo shareLocation. Si preguntan dónde están y aún no sabes la sede, pon shareLocation="both" (se adjuntan los DOS mapas, Fitness y Xtreme, ambos en Sangolquí) y pregunta por qué sector vive o se mueve para recomendarle una (ver "Elegir la sede"). Cuando ya haya una sede definida y toque compartir su ubicación, pon shareLocation="sede". En tu texto solo invita con naturalidad (p. ej. "te paso la ubicación 👇"). No obligues a elegir sede antes de darle la info.

# Cómo es cada sede por dentro (tamaño e instalaciones)
Úsalo cuando pregunten si el gimnasio es grande, cómo es el espacio, o qué diferencia hay entre las sedes. Habla con orgullo de las dos: el método SRXFIT es idéntico en ambas y la sede se elige por cercanía y horario, nunca porque una sea "mejor".
- **La Cueva Xtreme** es la que la gente conoce como "el grande": más de 460 m² solo para entrenar, dentro de La Casona del Colibrí, un complejo deportivo de 2 hectáreas donde hay únicamente tres negocios — tenis, fútbol y nuestro gimnasio. Si alguien pregunta por "el gimnasio grande", se refiere a esta.
- **La Cueva Fitness** es nuestra primera sucursal y es más pequeña: 240 m² de espacio para entrenar más una pista interna en balcón de 50 metros lineales. Es espaciosa, bonita y muy bien equipada; lo que no tiene es un terreno tan grande alrededor.
Si preguntan "¿es grande?" sin decir de cuál sede hablan, contesta con la de ellos si ya la sabes; si no, cuenta las dos en una línea cada una y aprovecha para preguntar por qué sector viven o se mueven.

# Elegir la sede (la eliges tú, no el lead)
Casi nadie conoce nuestras sedes por nombre: NUNCA preguntes "¿Fitness o Xtreme?" ni "¿qué sede prefieres?" a quien no las ha mencionado. Pregunta por dónde vive, trabaja o se mueve en el día, con lugares que conozca (si le queda más a mano el centro de Sangolquí o si viene de otro lado del valle de Los Chillos), y con eso recomiéndale tú una.
Para decidir: las dos están en Sangolquí, a menos de 2 km una de otra. La Cueva Fitness está en el sector de los Bomberos; La Cueva Xtreme, en La Casona del Colibrí (sector Colibrí), al noreste de la Fitness. Si el lugar que te dice queda claramente más cerca de una, recomiéndala. Si no estás seguro o le queda parecido, decide por el horario que le sirve (Fitness arranca a la media hora: 5:30, 6:30…; Xtreme en punto: 6:00, 7:00…). Dile cuál le recomiendas y por qué en pocas palabras; nunca inventes distancias ni tiempos de viaje. Si el lead ya nombró una sede o prefiere la otra, respeta lo que diga.

# Si pide que le escribamos más adelante
Si el lead dice que ahora no puede y pide que le escribamos después (tiene pagado otro gimnasio hasta cierta fecha, viaja, empieza en enero, "escríbeme la otra semana", "después de quincena"), no insistas ni le ofrezcas agendar ya: agradece, confirma en una línea cuándo le escribimos ("¡De una! Te escribo el 5 de noviembre 🙌") y devuelve contactarDesde con esa fecha. Desde ese momento no recibe más seguimientos automáticos y ese día una persona del equipo le escribe.
- contactarDesde va en formato "YYYY-MM-DD". Resuelve "la otra semana", "a fin de mes", "en enero" con la fecha actual que te damos. Si dice hasta cuándo no puede ("tengo pagado hasta el 5"), usa ese día. Si quiere arrancar en un día que queda a más de 2 días, usa el día anterior a ese, para agendarle a tiempo.
- Si solo dice "más adelante" sin fecha, usa 14 días desde hoy y dile que le escribes en un par de semanas.
- Si quiere agendar dentro de hoy, mañana o pasado mañana, eso no es posponer: agenda. Si dijo que no le interesa, eso tampoco: es LOST. En cualquier otro caso, contactarDesde=null.

# Agendar la primera sesión (arranque de sus dos semanas)
Ofrece los horarios de la sede del lead (te los damos abajo). Enmárcalo como "tu primera sesión" / "arrancas tus dos semanas", no como "tu evaluación" suelta. Agenda solo para hoy, mañana o máximo pasado mañana; si pide más de 2 días, no agendes aún: devuelve contactarDesde con el día anterior (ver "Si pide que le escribamos más adelante"). Al confirmar, pon shareLocation="sede" para adjuntar el mapa de la sede (no escribas el enlace tú) y pide que llegue 15 min antes.

# Notas de voz, fotos y archivos (NO los puedes abrir)
Por este canal solo te llega TEXTO. Cuando veas un turno marcado como "[El cliente envió una NOTA DE VOZ / IMAGEN / ...]", significa que el cliente mandó un archivo que tú NO escuchaste ni viste. Nunca finjas que lo revisaste ni adivines su contenido.
- Nota de voz: discúlpate corto y pide lo mismo por escrito, sin hacerlo sentir mal, y de ser posible facilítale la respuesta. Ej.: "¡Ay, Ale! Por aquí no logro escuchar las notas de voz 🙈 ¿me lo escribes porfa? Si es por el horario, dime qué hora te queda mejor y te ubico."
- Foto/documento: dile con naturalidad que no puedes abrir archivos por este medio y pregúntale de qué se trata. Si parece un comprobante de pago, una receta médica o algo delicado, marca handoff=true para que lo revise una persona.
- Si el archivo venía con texto (caption), responde a ese texto normalmente y solo aclara lo del archivo.
- No cambies de etapa ni des por agendada una cita basándote en un archivo que no pudiste leer.

# Handoff a humano
HORAS AMBIGUAS: si el lead da una hora que existe en la mañana Y en la tarde de su sede ("a las 8", "8 a 9" = la clase que empieza a las 8 y termina a las 9), pregunta UNA sola vez si es de mañana o de tarde. Si ya dio pistas ("en la tarde no puedo", pregunta hasta qué hora abren en la mañana), resuélvelo tú. Nunca hagas la misma pregunta dos veces seguidas: si el lead no la contesta, cambia de enfoque o marca handoff=true.

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
- contactarDesde: la fecha "YYYY-MM-DD" en que el lead pidió que le volvamos a escribir (ver "Si pide que le escribamos más adelante"), o null.
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
    contactarDesde: { type: ["string", "null"], description: "YYYY-MM-DD en que el lead pidió que le volvamos a escribir, o null." },
    scheduledAtISO: { type: ["string", "null"] },
  },
  required: ["reply", "shareLocation", "intent", "sede", "objetivo", "horarioPreferido", "handoff", "suggestedStage", "contactarDesde", "scheduledAtISO"],
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
  /** "YYYY-MM-DD": the lead asked us to write again that day (see postpone.ts). */
  contactarDesde: string | null;
  scheduledAtISO: string | null;
};

export type AgentTurn = { role: "user" | "assistant"; text: string };

/**
 * Which free-text nudge we're writing for a lead who went quiet. Both go out
 * inside Meta's 24h window, so they cost nothing and can be personal; from day 3
 * on only approved templates are allowed (see sequences.ts).
 *
 * `angle` is the reason the second touch brings (picked by the caller, see
 * pickNudgeAngle); `avoid` lists what a first draft got wrong, for the retry.
 */
export type FollowupStep = { step: 1 | 2; hoursSilent: number; angle?: NudgeAngle; avoid?: string[] };

/**
 * Reasons the ~22 h touch can bring. Left to itself the model wrote the same
 * one every time (corte del 19 oct 2026: "nutricionista de planta + health app +
 * nada de llegar y sufrir + ¿Sería muy loco arrancar esta semana?"), so the code
 * picks one per conversation and the leads, together, get a spread. There's no
 * social-proof angle on purpose: we have no verified testimonials to give it.
 */
export const NUDGE_ANGLES = {
  horario:
    "Propón un día concreto y dos horas de la lista de horarios (de su sede si ya la sabes; si no, de la que le convenga por lo que te contó), para que conteste con una palabra.",
  oferta:
    "Recuérdale en una línea algo concreto de las dos semanas por $9 que todavía no le hayas dicho (entrena las dos semanas guiado por un coach y al final sabe, con datos de su condición física y salud, qué entrenamiento le conviene) y pregúntale qué día arrancaría.",
  objetivo:
    "Conecta con lo que dijo que quiere lograr, con sus palabras, y cuéntale en una línea cómo se trabaja eso desde la primera semana. Si no dijo objetivo, pregúntale qué le gustaría lograr.",
  arranque:
    "Quítale el miedo a empezar: no necesita estar en forma, la primera sesión arranca con su evaluación y el entrenamiento se adapta a su nivel. Cierra con un día concreto para arrancar.",
} as const;
export type NudgeAngle = keyof typeof NUDGE_ANGLES;

/**
 * The angle for a conversation: stable (a retry of the same nudge keeps it) and
 * spread across leads. FNV-1a over the id — any cheap, even hash does.
 */
export function pickNudgeAngle(seed: string): NudgeAngle {
  const angles = Object.keys(NUDGE_ANGLES) as NudgeAngle[];
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  return angles[(h >>> 0) % angles.length];
}

/**
 * Lines the nudges kept repeating. The prompt asks for variety; these are the
 * checks behind it (nudgeIssues), so a draft that still uses one is rewritten.
 */
const WORN_OUT = [
  "¿Sería muy loco…?",
  "nada de \"llegar y sufrir\"",
  "la nutricionista y la app juntas como argumento de cajón",
];

/**
 * The internal turn that asks the agent for a nudge instead of a reply. It rides
 * as a user turn after our own unanswered message (the API needs the last turn
 * to be the user's), clearly marked so the model never reads it as the lead.
 */
export function followupInstruction(f: FollowupStep): string {
  const how =
    f.step === 1
      ? "Retoma lo último que hablaron con una pregunta muy fácil de contestar (idealmente con una palabra o eligiendo entre dos opciones). No repitas la oferta completa. " +
        "Si todavía no sabes qué sede le conviene, pregúntale por qué sector vive o se mueve (p. ej. si le queda más a mano el centro de Sangolquí o más el lado de Los Chillos); nunca le preguntes \"¿Fitness o Xtreme?\": no conoce las sedes por nombre."
      : "Si el lead dejó una pregunta o duda sin resolver (precio, horario, ubicación, miedo a no estar en forma…), resuélvela: ese es tu motivo. " +
        `Si no, tu motivo es este: ${NUDGE_ANGLES[f.angle ?? "horario"]} ` +
        "Cierra con UNA pregunta corta que pueda contestar con un sí o un no sin culpa, escrita con tus palabras. " +
        `No copies ejemplos ni frases de este prompt y no uses estas fórmulas gastadas: ${WORN_OUT.join("; ")}. ` +
        "No inventes testimonios ni cifras de otros socios.";
  const fix = f.avoid?.length
    ? ` Tu borrador anterior no sirvió porque ${f.avoid.join("; ")}. Escríbelo de nuevo sin eso.`
    : "";
  return (
    `[INSTRUCCIÓN INTERNA — no es un mensaje del lead] El lead no contesta hace unas ${f.hoursSilent} horas. ` +
    `Escribe UN seguimiento corto (1 a 3 líneas) que suene a la misma persona que venía conversando. ${how}${fix} ` +
    `No digas "¿viste mi mensaje?", no reclames el silencio, no inventes cupos ni plazos. ` +
    `Si en la conversación el lead ya dijo que no le interesa o que no le escriban, devuelve reply vacío. ` +
    `Si pidió que le escribamos más adelante, devuelve reply vacío y contactarDesde con esa fecha (o 14 días desde hoy si no dio una). ` +
    `En la salida: shareLocation="none", scheduledAtISO=null, handoff=false, y la etapa y la sede que ya tenía.`
  );
}

/**
 * What's wrong with a drafted nudge, in words the retry instruction can use.
 * Empty = it can go out. Pure (scripts/test-posponer.ts).
 */
export function nudgeIssues(text: string, step: FollowupStep["step"]): string[] {
  const issues: string[] = [];
  const t = text.toLocaleLowerCase("es-EC");
  // Naming both sedes in a nudge is the "¿Fitness o Xtreme?" question in any wording.
  if (/\bfitness\b/.test(t) && /\bxtreme\b/.test(t)) {
    issues.push("le preguntaste por la sede por su nombre (pregunta por el sector donde vive o se mueve)");
  }
  if (step === 2) {
    if (/ser[ií]a\s+(muy\s+)?loco/.test(t)) issues.push("usaste la fórmula «¿Sería muy loco…?»");
    if (/llegar\s+y\s+sufrir/.test(t)) issues.push("repetiste «llegar y sufrir»");
  }
  return issues;
}

/**
 * Run the agent over a conversation history and return the reply + qualification.
 * `history` is oldest→newest; the last entry should be the lead's inbound message.
 * `knownSede` narrows the slots we show when the sede is already known.
 */
export async function runAgent(
  history: AgentTurn[],
  opts: {
    knownSede?: Sede | null;
    leadName?: string | null;
    adContext?: string | null;
    /** Write a no-reply nudge instead of answering (see followupInstruction). */
    followup?: FollowupStep | null;
  } = {},
): Promise<AgentResult> {
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
    `Horarios disponibles para la primera sesión (L–V, hora Ecuador):\n${slotsContext}\n` +
    `Son HORAS DE INICIO: la clase dura una hora. La última de la tarde empieza a la hora que dice y termina una hora después — no ofrezcas nada más tarde.\n` +
    `Sábados SÍ hay clases para socios, pero NO se agendan evaluaciones ni primeras sesiones: suele haber un solo coach y no se abastece. Si preguntan por sábado, dilo así — no digas que cerramos el fin de semana.` +
    (opts.leadName ? `\n\nNombre del lead (de WhatsApp): ${opts.leadName}` : "") +
    (opts.adContext ? `\n\n${opts.adContext}` : "");

  const messages = [
    { role: "user", content: contextBlock },
    { role: "assistant", content: "Entendido. Estoy listo para atender al lead con ese contexto." },
    ...history.map((t) => ({ role: t.role, content: t.text })),
    ...(opts.followup ? [{ role: "user", content: followupInstruction(opts.followup) }] : []),
  ];

  const parsed = await callResponder<AgentResult>(SYSTEM_PROMPT, OUTPUT_SCHEMA, messages, "Devuelve la respuesta de WhatsApp para el lead + su calificación estructurada.");
  return { ...parsed, reply: normalizeRegistro(parsed.reply ?? "") };
}

/**
 * One forced tool call → the structured answer.
 *
 * Structured output via TOOL USE (not `output_config.format`): forcing the
 * long, emoji-heavy free-text `reply` through the json_schema grammar was
 * producing intermittent character corruption ("te resento La escue") and the
 * occasional empty field. A forced tool call lets the model write the JSON
 * naturally, which is far more robust for conversational text. `effort` still
 * lives inside `output_config` (a recent API surface — cast to keep tsc green).
 */
async function callResponder<T>(
  system: string,
  schema: object,
  messages: { role: string; content: string }[],
  description: string,
): Promise<T> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  const params = {
    model: MODEL,
    max_tokens: 1024,
    system,
    tools: [{ name: "responder", description, input_schema: schema }],
    tool_choice: { type: "tool", name: "responder" },
    output_config: { effort: EFFORT },
    messages,
  };
  const response: Anthropic.Message = await (client.messages.create as (p: unknown) => Promise<Anthropic.Message>)(params);

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("El agente no devolvió la llamada a la herramienta 'responder'.");
  }
  return toolUse.input as T;
}

// ── Modo socio ──────────────────────────────────────────────────────────────
//
// Until 16 oct 2026 a socio who wrote paused the bot ("el agente vende"), and one
// who had been a lead got the $9 pitch. Santiago's call: the agent answers socios
// too, with limits — its job there is getting them back to training, by the table
// of dropout causes in the ventas-conversacionales skill (seguimientos.md):
// name the problem, offer one concrete solution, close with "¿qué día vuelves?".
// Injuries, money and complaints go to a person (also enforced in code, guards.ts).

export const MEMBER_SYSTEM_PROMPT = `Eres del equipo de La Cueva (dos sedes en Sangolquí, Ecuador: La Cueva Fitness y La Cueva Xtreme). Atiendes por WhatsApp a un SOCIO: ya entrena con nosotros y conoce el método SRXFIT. No es un prospecto: NUNCA le ofrezcas las dos semanas por $9, ni le expliques el método, ni le hables de precios de mensualidad.

${REGISTRO}

# Tu objetivo
Que vuelva a entrenar y no se nos vaya. Cada mensaje hace estas tres cosas, en este orden y en 1 a 3 líneas:
1. Nombra lo que le pasa, con sus palabras ("Suena a que el horario nuevo del trabajo te complicó"). Nunca "entiendo, pero…" ni "no te preocupes".
2. Ofrece UNA solución concreta, no un recordatorio (tabla de abajo).
3. Cierra con un día: "¿Qué día vuelves?" o dos opciones ("¿Te espero mañana 6:30 o el jueves?").
UNA sola pregunta por mensaje. Cero culpa, cero reproche por los días sin venir. Afirma lo que ha logrado si viene al caso.

# Causas típicas y qué ofrecer
- Falta de tiempo / cambió su horario: otro turno de su sede (solo los de la lista que te damos), o una sesión más corta ese día; si solo puede 2 días, que vengan esos 2 días fijos.
- No ve resultados / se estancó: revisar su progreso y sus medidas con su coach, o una cita con la nutricionista de planta (se agenda desde su app de La Cueva).
- Aburrimiento, desmotivación o se siente solo: venir con un amigo, el reto del mes, o entrenar en el turno donde está la gente de su nivel; su coach se lo presenta.
- Viaje o enfermedad (que no sea lesión): ¡que se recupere / buen viaje! Pregunta qué día cree que vuelve. Si quiere pausar o congelar el plan, eso lo registra la administración: handoff=true.
- Solo saluda o pregunta algo simple (horarios de su sede, si hay clase hoy): contesta y, si lleva días sin venir, cierra con el día para volver.

# Límites (pasa a una persona: handoff=true)
- Lesión, dolor o un tema de salud: NUNCA diagnostiques ni recomiendes ejercicios ni reposo. Dile con calidez que su coach le escribe para adaptar la rutina. handoffReason="lesion".
- Cobros, pagos, facturas, renovación, deudas, precios, descuentos o cambios de plan: no prometas nada; dile que alguien de la administración le escribe enseguida. handoffReason="cobro".
- Reclamo o queja (de un coach, de la sede, de un cobro, de la app): agradece que lo cuente, nombra el malestar sin justificarte ni discutir, y dile que una persona del equipo lo revisa. handoffReason="reclamo".
- Pide hablar con una persona, o algo que no sabes con certeza (horarios del sábado, datos de su plan): handoffReason="persona" o "no_se".
No prometas nada que dependa de la administración ni inventes horarios, cupos, retos o fechas. Si no sabes un dato, no lo digas.

# Notas de voz, fotos y archivos (NO los puedes abrir)
Si ves "[El cliente envió una NOTA DE VOZ / IMAGEN / ...]", no lo escuchaste ni lo viste: pídele con naturalidad que te lo escriba. Si parece un comprobante de pago o un certificado médico, handoff=true (cobro o lesion).

# Tu salida
Devuelve SIEMPRE el JSON con:
- reply: el mensaje de WhatsApp (en español, listo para enviar, sin enlaces ni URLs).
- causa: la causa principal de que no venga, si la dijo: tiempo, resultados, motivacion, viaje_enfermedad, lesion, dinero, otra, o ninguna.
- handoff: true si hay que pasar a una persona.
- handoffReason: lesion, cobro, reclamo, persona, no_se, o ninguno.
- vuelve: el día que dijo que vuelve, en sus palabras ("el lunes", "mañana 6:30"), o null.`;

const MEMBER_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Mensaje de WhatsApp listo para enviar, en español. SIN enlaces ni URLs." },
    causa: { type: "string", enum: ["tiempo", "resultados", "motivacion", "viaje_enfermedad", "lesion", "dinero", "otra", "ninguna"] },
    handoff: { type: "boolean" },
    handoffReason: { type: "string", enum: ["lesion", "cobro", "reclamo", "persona", "no_se", "ninguno"] },
    vuelve: { type: ["string", "null"] },
  },
  required: ["reply", "causa", "handoff", "handoffReason", "vuelve"],
  additionalProperties: false,
} as const;

export type MemberHandoffReason = "lesion" | "cobro" | "reclamo" | "persona" | "no_se";

export type MemberAgentResult = {
  reply: string;
  causa: "tiempo" | "resultados" | "motivacion" | "viaje_enfermedad" | "lesion" | "dinero" | "otra" | "ninguna";
  handoff: boolean;
  handoffReason: MemberHandoffReason | "ninguno";
  vuelve: string | null;
};

/** What the agent knows about the socio, for its context block. Pure: built by the runner. */
export type MemberContext = {
  firstName: string | null;
  sede: Sede;
  /** Calendar days since the last visit, or null if we have none on record. */
  daysSinceLastVisit: number | null;
  /** "L-X-V (3/sem)", from absence-rhythm.ts. */
  rhythm: string | null;
};

/** The context turn for a socio. Exported so the test can check what the model sees. */
export function memberContextBlock(ctx: MemberContext, now = new Date()): string {
  const nowEcuador = new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now);
  const i = SEDE_INFO[ctx.sede];
  const gone =
    ctx.daysSinceLastVisit == null
      ? "No tenemos asistencias registradas recientes."
      : ctx.daysSinceLastVisit <= 1
        ? "Vino a entrenar hace poco (hoy o ayer)."
        : `Su última asistencia fue hace ${ctx.daysSinceLastVisit} días.`;
  return (
    `Fecha y hora actual (Ecuador, UTC-5): ${nowEcuador}.

` +
    `Socio: ${ctx.firstName ?? "sin nombre registrado"} · sede ${i.name}.
` +
    `${gone}${ctx.rhythm ? ` Su ritmo de las últimas semanas: ${ctx.rhythm}.` : ""}

` +
    `Turnos de ${i.name} (L–V, hora de inicio, la clase dura una hora): mañana ${i.morning} · tarde ${i.evening}.
` +
    `Los sábados hay clases para socios, pero no tienes sus horarios: si preguntan, que recepción le confirme (handoff=true, no_se).`
  );
}

/** The agent's reply to a socio (see MEMBER_SYSTEM_PROMPT). */
export async function runMemberAgent(history: AgentTurn[], ctx: MemberContext): Promise<MemberAgentResult> {
  const messages = [
    { role: "user", content: memberContextBlock(ctx) },
    { role: "assistant", content: "Entendido. Estoy listo para atender al socio con ese contexto." },
    ...history.map((t) => ({ role: t.role, content: t.text })),
  ];
  const parsed = await callResponder<MemberAgentResult>(MEMBER_SYSTEM_PROMPT, MEMBER_OUTPUT_SCHEMA, messages, "Devuelve la respuesta de WhatsApp para el socio y si hay que pasarlo a una persona.");
  return { ...parsed, reply: normalizeRegistro(parsed.reply ?? "") };
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

/**
 * "bacán" → "chévere".
 *
 * Las dos son ecuatorianas y las dos estaban aprobadas, pero Santiago eligió
 * una (22 sep 2026): la voz de La Cueva dice "chévere". No es una corrección de
 * registro como el voseo — es una preferencia de marca, y por eso vive en su
 * propia función en vez de mezclarse con VOSEO_FIXES.
 *
 * El caso que la motivó necesita más que cambiar la palabra: "Bacán que te
 * animes" no se vuelve "Chévere que te animes" sino "Qué chévere que te
 * animes". De ahí las tres pasadas, en este orden:
 *   1. "Qué bacán" → "Qué chévere"      (ya trae el "qué", solo se cambia la palabra)
 *   2. "Bacán que" → "Qué chévere que"  (le falta el "qué", se le pone)
 *   3. lo que quede                     ("Bacán, te espero" → "Chévere, te espero")
 * Invertir 1 y 2 produciría "Qué qué chévere que".
 */
export function preferChevere(text: string): string {
  let out = text;
  // Acepta "bacan" sin tilde: el modelo la escribe con tilde, pero un lead no.
  out = out.replace(
    /(?<!\p{L})(qué|que)(\s+)bac[aá]n(?!\p{L})/giu,
    (_m, qué: string, espacio: string) => `${qué}${espacio}chévere`,
  );
  out = out.replace(
    /(?<!\p{L})bac[aá]n(?=\s+que(?!\p{L}))/giu,
    (m: string) => matchCase(m, "qué chévere"),
  );
  out = out.replace(
    /(?<!\p{L})bac[aá]n(?!\p{L})/giu,
    (m: string) => matchCase(m, "chévere"),
  );
  return out;
}

/**
 * Todo lo que se le hace al texto del modelo antes de mandarlo: quitar formas
 * rioplatenses y fijar la palabra de la casa. Un solo punto de entrada para que
 * una regla nueva no se quede sin aplicar en la mitad de los sitios.
 */
export function normalizeRegistro(text: string): string {
  return plainApp(preferChevere(neutralizeVoseo(text)));
}

/**
 * "health app" → "app". The old approved copy said "health app"; Santiago wants
 * plain "app" (19 oct 2026), and the nudges kept the old wording.
 */
export function plainApp(text: string): string {
  return text.replace(/(?<!\p{L})health\s+app(?!\p{L})/giu, (m: string) => matchCase(m, "app"));
}

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
