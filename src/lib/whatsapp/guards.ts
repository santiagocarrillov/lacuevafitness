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
