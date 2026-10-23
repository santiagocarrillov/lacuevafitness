/**
 * Guardas deterministas alrededor del agente: cosas que NO se le dejan al modelo.
 *
 * El 23 sep 2026 Ibeth (52 años, nunca había ido a un gimnasio, a 2 minutos de
 * Xtreme) escribió "Alguien me puede llamar" y luego "Necesito hablar con una
 * persona". El prompt ya decía "si pide hablar con una persona, handoff=true" y
 * el modelo igual le contestó —por sexta vez seguida— "¿la 8:00 la quieres en la
 * mañana o en la tarde?". Una persona la atendió una hora después y ella ya no
 * alcanzaba a ir.
 *
 * Dos reglas, en código porque el prompt ya demostró que no basta:
 *   1. Quien pide una persona o una llamada, la recibe. Siempre.
 *   2. Si el bot va a hacer la misma pregunta por tercera vez seguida, no la
 *      hace: el lead no la está pudiendo contestar y eso lo resuelve una persona.
 */

import { foldText } from "./search";

// Sobre texto ya plegado (sin tildes, minúsculas). "Me llamo Ibeth" y "¿cómo se
// llama el gym?" NO deben disparar: por eso se piden las formas de "llamar a
// alguien" (llamen, llámame, llamarme, una llamada…) y no cualquier "llam-".
const HUMAN_REQUEST: RegExp[] = [
  /\bhablar con (una |alguna )?(persona|alguien|asesora?|humano|encargad[oa]|administrador[a]?)\b/,
  /\b(una )?persona (real|de verdad)\b/,
  /\bno (eres|es) (un )?(bot|robot|maquina)\b/,
  /\b(me )?(pueden|puede|podrian|podria|podras|puedes) llamar\b/,
  /\bllam(ame|enme|arme|eme|arnos|en)\b/,
  /\b(una|la) llamada\b/,
  /\b(un|algun|con un|con el) asesora?\b/,
  /\bnecesito (a )?(alguien|una persona)\b/,
];

/** ¿Alguno de estos mensajes del cliente pide hablar con una persona o que lo llamen? */
export function asksForHuman(inboundTexts: string[]): boolean {
  return inboundTexts.some((t) => {
    const f = foldText(t);
    return HUMAN_REQUEST.some((re) => re.test(f));
  });
}

// Palabras que no dicen qué se está preguntando.
const STOPWORDS = new Set([
  "a", "al", "de", "del", "el", "la", "las", "los", "lo", "en", "o", "y", "e", "u",
  "te", "me", "se", "tu", "mi", "que", "para", "con", "por", "un", "una", "es", "si",
  "ya", "no", "nomas", "porfa", "solo", "pero", "asi", "eso", "esto",
]);

function tokens(text: string): Set<string> {
  const words = foldText(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Las frases de un mensaje que PIDEN algo: las que llevan "?" o un "dime". Lo
 * demás ("¡Genial, Ibeth! 🙌", "arrancas tus dos semanas 💪") es relleno que
 * cambia de un mensaje a otro sin cambiar lo que se pregunta.
 */
function asks(text: string): Set<string>[] {
  return text
    // Se corta también antes de "¿" y después de ":": "…para dejarte reservada:
    // ¿la 8:00 en la mañana o en la tarde?" es relleno + pregunta, y el relleno
    // diluye el parecido entre dos mensajes que preguntan exactamente lo mismo.
    .split(/(?<=[.!?\n:])\s|(?=¿)/)
    .filter((s) => s.includes("?") || /\bdime\b/.test(foldText(s)))
    .map(tokens)
    .filter((t) => t.size >= 3);
}

/** Qué tanto se parecen las preguntas de dos mensajes (0–1). */
export function questionOverlap(a: string, b: string): number {
  let best = 0;
  for (const x of asks(a)) {
    for (const y of asks(b)) {
      let inter = 0;
      for (const w of x) if (y.has(w)) inter++;
      best = Math.max(best, inter / Math.min(x.size, y.size));
    }
  }
  return best;
}

const REPEAT_THRESHOLD = 0.7;

/**
 * ¿La respuesta nueva repite la pregunta de los DOS mensajes anteriores del bot?
 * `previousBotReplies` son los últimos mensajes salientes, del más viejo al más
 * nuevo, solo si ninguno lo escribió una persona.
 */
export function isThirdRepeat(reply: string, previousBotReplies: string[]): boolean {
  if (previousBotReplies.length < 2) return false;
  const [older, newer] = previousBotReplies.slice(-2);
  return (
    questionOverlap(reply, newer) >= REPEAT_THRESHOLD &&
    questionOverlap(reply, older) >= REPEAT_THRESHOLD
  );
}

/** Lo que se le dice al lead cuando se lo pasamos a una persona por una de estas guardas. */
export function handoffReply(reason: "asked" | "repeat", name: string | null): string {
  const who = name ? `, ${name}` : "";
  return reason === "asked"
    ? `¡Claro${who}! 🙌 Ya le aviso a una persona del equipo para que te escriba o te llame en cuanto pueda.`
    : `Perdón${who}, creo que te estoy preguntando lo mismo 🙈 Te paso con una persona del equipo para que te ayude mejor; te escribe en cuanto pueda.`;
}

// ── Socios: lo que siempre atiende una persona ──────────────────────────────
//
// Santiago (16 oct 2026): el agente contesta a los socios, pero lesiones, cobros
// y reclamos los ve una persona. El prompt lo pide; esto lo garantiza, igual que
// con Ibeth: ante la duda, pasa a una persona (un falso positivo cuesta un
// mensaje del equipo; un falso negativo es un bot opinando sobre una rodilla).
const MEMBER_PERSON_TOPICS: Array<{ reason: "lesion" | "cobro" | "reclamo"; patterns: RegExp[] }> = [
  {
    reason: "lesion",
    patterns: [
      /\blesi(on|one|onad[oa]|ones)\b/, /\blastim/, /\bdolor(es)?\b/, /\bme duel[ea]n?\b/, /\b(esguince|desgarro|fractura|tendinitis|hernia|contractura|luxacion)\b/,
      /\bme (torci|dobl[eo]|operaron|van a operar)\b/, /\b(cirugia|operacion|fisio|fisioterap\w*|traumatolog\w*)\b/, /\bcertificado medico\b/,
    ],
  },
  {
    reason: "cobro",
    patterns: [
      /\bcobr(o|os|aron|an|ar|ando)\b/, /\bpag(o|os|ue|ar|ado|aron|e)\b/, /\bfactura/, /\bdeuda\b/, /\b(le|les) debo\b/,
      /\btransferencia\b/, /\bdeposit(o|e|ar)\b/, /\brenov(ar|acion|e)\b/, /\bcuanto (cuesta|vale|sale|es la|seria)\b/, /\bprecio\b/,
      /\bdescuento\b/, /\b(reembolso|devolucion|devuelv)/, /\bcongel(ar|o|e|amiento)\b/, /\b(pausar|suspender|cancelar) (mi |el )?(plan|membresia|mensualidad)\b/,
    ],
  },
  {
    reason: "reclamo",
    patterns: [
      /\b(queja|quejarme|reclamo|reclamar)\b/, /\bpesim[oa]\b/, /\bmal(a)? (servicio|atencion|trato)\b/, /\binaceptable\b/,
      /\bdecepcion/, /\bgroser[oa]\b/, /\bfalta de respeto\b/, /\bestoy (muy )?(molest|enojad|indignad)/,
    ],
  },
];

/** ¿Algún mensaje del socio toca un tema que solo atiende una persona? Devuelve cuál. */
export function memberNeedsPerson(inboundTexts: string[]): "lesion" | "cobro" | "reclamo" | null {
  const folded = inboundTexts.map(foldText);
  for (const topic of MEMBER_PERSON_TOPICS) {
    if (folded.some((f) => topic.patterns.some((re) => re.test(f)))) return topic.reason;
  }
  return null;
}

/** Lo que se le dice al socio cuando lo pasamos a una persona. */
export function memberHandoffReply(reason: "lesion" | "cobro" | "reclamo" | "persona" | "no_se", name: string | null): string {
  const who = name ? `, ${name}` : "";
  switch (reason) {
    case "lesion":
      return `Gracias por contarme${who} 🙏 Le paso tu mensaje a tu coach para que te escriba y adaptemos tu rutina. Lo importante es que te recuperes bien.`;
    case "cobro":
      return `¡Claro${who}! Eso lo ve la administración: ya les aviso para que te escriban en cuanto puedan.`;
    case "reclamo":
      return `Gracias por decírnoslo${who}, de verdad. Le paso tu mensaje a una persona del equipo para que lo revise y te escriba.`;
    case "persona":
      return handoffReply("asked", name);
    case "no_se":
      return `Déjame confirmarlo${who}: le paso tu pregunta a recepción para que te responda en cuanto puedan.`;
  }
}

/**
 * ¿Se puede mandar lo que el modelo escribió para un socio cuyo tema ve una persona?
 *
 * Hasta el 23 oct 2026 esos casos recibían una frase fija ("Gracias por contarme…
 * le paso tu mensaje a tu coach"), igual para un hombro que para una gripe. Santiago
 * pidió que el bot entienda por qué no vino y responda con empatía y sinceridad, así
 * que ahora sale lo que escribió el modelo — salvo que se meta en lo que no le toca.
 * Si no pasa, vuelve la frase fija: un mensaje frío es mejor que uno peligroso.
 */
export function memberReplyIsSafe(reply: string, reason: "lesion" | "cobro" | "reclamo" | "persona" | "no_se"): boolean {
  const f = foldText(reply);
  if (!f.trim()) return false;
  // Siempre dice que una persona del equipo le escribe: es lo que promete la tarea.
  if (!/\b(coach|equipo|administracion|recepcion|persona|companer[oa]s?)\b/.test(f)) return false;
  // Ni diagnóstico ni tratamiento: "es normal", "ponte hielo", "descansa", "estira".
  const medical =
    /\b(repos[oa]|descans(a|es|ar)|hielo|compresas?|calor local|estir(a|ar|amientos?)|ibuprofeno|antiinflamatori\w*|analgesic\w*|pastillas?|medic(o|ina|amento)s?|pomadas?|cremas?|masajes?|ejercicios? de|tendinitis|desgarro|contractura|esguince|inflamacion|no es grave|es normal|seguro (es|sera))\b/;
  if (reason === "lesion" && medical.test(f)) return false;
  // Ni precios ni promesas de plata: eso lo decide la administración.
  const money = /\$|\b\d+\s*(dolares|usd)\b|\b(descuento|gratis|sin costo|reembolso|te devolvemos|te reembolsamos|te congelamos|ya (esta|quedo) (registrad|pagad)\w*)\b/;
  if (money.test(f)) return false;
  return true;
}

