/**
 * Reacciones de WhatsApp (👍 ❤️ 😂 …) sobre un mensaje nuestro.
 *
 * Meta las manda como un mensaje propio: `{ type: "reaction", reaction:
 * { message_id, emoji } }`, donde `message_id` es el wamid del mensaje al que
 * reaccionaron y `emoji` vacío significa que quitaron la reacción. Hasta el 23 sep
 * 2026 guardábamos solo "[reaction]" y el emoji se perdía: Ibeth reaccionó a la
 * explicación de horarios de Majo y nadie pudo saber si fue un 👍 o un 😢.
 *
 * Una reacción NO despierta al bot: no es una pregunta, y contestarle a un 👍 con
 * otro mensaje de venta es exactamente el ruido que espanta a un lead.
 */

export type WaReaction = { message_id?: string; emoji?: string };

const SNIPPET_MAX = 60;

/** Texto que ve el staff en el hilo. `targetBody` es el mensaje reaccionado, si lo tenemos. */
export function reactionBody(emoji: string | undefined, targetBody: string | null): string {
  const e = (emoji ?? "").trim();
  const action = e ? `Reaccionó ${e}` : "Quitó su reacción";
  if (!targetBody) return action;
  const oneLine = targetBody.replace(/\s+/g, " ").trim();
  const snippet = oneLine.length > SNIPPET_MAX ? `${oneLine.slice(0, SNIPPET_MAX - 1).trimEnd()}…` : oneLine;
  return `${action} a: «${snippet}»`;
}
