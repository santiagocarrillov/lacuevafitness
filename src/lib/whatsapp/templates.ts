/**
 * FollowupKind → plantilla aprobada de Meta.
 *
 * Fuera de la ventana de 24h de WhatsApp no se puede mandar texto libre: hay que
 * mandar una plantilla aprobada. Este módulo decide CUÁL plantilla le toca a cada
 * followup y con qué variables, para que `processDueFollowups` deje de marcar
 * FAILED todo lo que cae fuera de ventana.
 *
 * El mapeo vive en código a propósito: la tabla `MessageTemplate` existe pero está
 * vacía y nadie la lee. Un mapa de 8 entradas que cambia cuando cambia el código
 * que lo usa no necesita una tabla; si algún día las plantillas se editan desde el
 * dashboard, ese es el momento de mover esto a la BD.
 *
 * Los nombres, el idioma (`es`, no `es_EC`) y el ORDEN de las variables tienen que
 * coincidir exactamente con lo aprobado en la WABA — ver docs/whatsapp-templates.md.
 */

import { SEDE_INFO } from "./agent";
import type { FollowupKind, Sede } from "@/generated/prisma/client";

/** Idioma con el que se aprobaron las 5 plantillas. */
export const TEMPLATE_LANGUAGE = "es";

/**
 * Qué plantilla le toca a cada tipo de followup.
 *
 * Las que faltan no tienen plantilla y por diseño: ADMIN_ATTENDANCE_PING va a un
 * admin (conversación siempre caliente) y TRIAL_CONFIRM sale al instante de que el
 * lead agenda, dentro de la ventana. `miembro_inasistencia` está aprobada pero no
 * se puede usar todavía: Conversation solo se ata a Lead, no a Member.
 */
const TEMPLATE_BY_KIND: Partial<Record<FollowupKind, string>> = {
  NO_REPLY_2H: "reengagement_no_reply",
  NO_REPLY_1D: "reengagement_no_reply",
  NO_REPLY_3D: "reengagement_no_reply",
  NOSHOW_RECOVERY_1D: "noshow_recuperacion",
  NOSHOW_RECOVERY_3D: "noshow_recuperacion",
  TRIAL_REMINDER_24H: "recordatorio_eval_24h",
  // El de 2h es legado; si quedó alguno pendiente sale con el texto de 1h, que es
  // el único recordatorio cercano que existe aprobado.
  TRIAL_REMINDER_2H: "recordatorio_eval_1h",
  TRIAL_REMINDER_1H: "recordatorio_eval_1h",
};

/** Plantillas que necesitan sede y hora además del nombre. */
const NEEDS_SEDE_Y_HORA = new Set(["recordatorio_eval_24h", "recordatorio_eval_1h"]);

export type TemplateSpec = {
  name: string;
  language: string;
  variables: string[];
};

/** Datos del lead con los que se arman las variables. */
export type TemplateContext = {
  firstName: string | null;
  lastName?: string | null;
  sede: Sede | null;
  /** Cuándo es la cita — solo hace falta para los recordatorios. */
  trialScheduledAt: Date | null;
};

/**
 * Nombre del lead limpio para meterlo en una plantilla.
 *
 * Los nombres vienen del perfil de WhatsApp y son basura con frecuencia
 * ("🌒..H..🪐⏳", "🤫🤐🙌🏻❤️‍🩹👩‍❤️‍👩kevin"). Meta además rechaza parámetros con saltos
 * de línea o tabs. Nos quedamos con la primera palabra que tenga letras de verdad;
 * si no hay ninguna, un saludo neutro — "¡Hola qué tal!" se lee bien y no inventa
 * un nombre ni asume género.
 */
export function templateName(firstName: string | null, lastName?: string | null): string {
  const raw = [firstName, lastName].filter(Boolean).join(" ");
  const tokens = raw.replace(/[\r\n\t]+/g, " ").split(/\s+/);

  for (const token of tokens) {
    // Deja solo letras, guiones y apóstrofes: "kevin❤️" → "kevin".
    // Los selectores de variación y el ZWJ son \p{M}, así que sobrevivían al
    // filtro y dejaban un carácter invisible pegado al nombre ("Kevin\uFE0F").
    const clean = token
      .replace(/[\u200D\uFE00-\uFE0F\u20E3]/gu, "")
      .replace(/[^\p{L}\p{M}'-]/gu, "");

    // Puro emoji o puntuación: no es un intento de nombre, sigue buscando. Así
    // "🩷 María" todavía saluda a María.
    if (clean.length === 0) continue;

    // Tiene letras pero no sirve → PARA aquí, no sigas pescando. El lead
    // 0995513631 se llama "Te" / "Amo Mi Pichuris🥰💋": seguir buscando producía
    // "¡Hola Amo!". Si la primera palabra con letras no es un nombre, es que el
    // perfil no tiene nombre — es un estado de WhatsApp, no una persona.
    if (clean.length < 3) break;
    if (PLACEHOLDER_TOKENS.has(clean.toLocaleLowerCase("es-EC"))) break;

    return clean.charAt(0).toLocaleUpperCase("es-EC") + clean.slice(1);
  }
  return "qué tal";
}

/**
 * Palabras que el propio sistema escribe cuando no hay nombre. Sin esto, el
 * lead guardado como "Sin nombre" recibía "¡Hola Sin!".
 */
const PLACEHOLDER_TOKENS = new Set([
  "sin", "nombre", "contacto", "lead", "cliente", "usuario", "desconocido", "null", "undefined",
]);

const hhmm = (d: Date) =>
  new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

/**
 * La plantilla (y sus variables) que le corresponde a este followup, o null si
 * ese tipo no tiene plantilla o le faltan datos para llenarla.
 */
export function templateForFollowup(
  kind: FollowupKind,
  ctx: TemplateContext,
): TemplateSpec | null {
  const name = TEMPLATE_BY_KIND[kind];
  if (!name) return null;

  const variables = [templateName(ctx.firstName, ctx.lastName)];

  if (NEEDS_SEDE_Y_HORA.has(name)) {
    // Sin hora de cita el recordatorio no dice nada: mejor no mandarlo.
    if (!ctx.trialScheduledAt) return null;
    variables.push(ctx.sede ? SEDE_INFO[ctx.sede].name : "La Cueva");
    variables.push(hhmm(ctx.trialScheduledAt));
  }

  return { name, language: TEMPLATE_LANGUAGE, variables };
}
