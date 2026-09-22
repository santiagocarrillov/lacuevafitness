/**
 * Red de seguridad: nadie se queda sin respuesta.
 *
 * El 21 sep a las 19:48 el bot le prometió a una lead —mamá de un bebé de 4
 * meses, quería entrenar con su esposo— "déjame confirmarte bien el tema del
 * espacio", se puso en pausa y programó su propia vuelta en una hora. Ella
 * escribió cinco mensajes más en los dos minutos siguientes, terminando con
 * *"confírmame lo del bebé x que no tenemos quien lo cuide en casa"*. Ninguno
 * obtuvo respuesta. A las 20:48 el cron despausó la conversación... y ya está.
 * 17 horas de silencio sobre la pregunta que decidía la venta.
 *
 * El hueco: `releaseDueBotHolds` **despausa pero no contesta**, y el agente solo
 * corre cuando entra un mensaje nuevo. Si el cliente dijo todo lo que tenía que
 * decir mientras el bot estaba en pausa y se quedó esperando —que es
 * exactamente lo que hace alguien a quien le prometieron una respuesta—, no hay
 * nada que vuelva a despertar al bot. Nunca.
 *
 * Este barrido cierra el hueco por el lado correcto: no pregunta POR QUÉ no se
 * contestó (handoff, un crash, un webhook perdido, un lock atascado), solo mira
 * el único hecho que le importa al cliente — **escribí y nadie me respondió**.
 */

import { prisma } from "@/lib/prisma";
import { respondToInboundConversation } from "./agent-runner";

/**
 * Cuánto se le da al camino en tiempo real antes de considerarlo fallido. El
 * webhook contesta en segundos; a los 5 minutos ya no viene.
 */
const GRACE_MS = 5 * 60 * 1000;

/** Fuera de la ventana de 24h no se puede mandar texto libre: eso es reenganche. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Tope por corrida. El cron pasa cada 15 minutos, así que una cola larga se
 * drena en varias vueltas en vez de disparar una ráfaga contra la Cloud API.
 */
const MAX_PER_RUN = 5;

export type UnansweredSummary = {
  /** Conversaciones esperando respuesta que entraban en esta corrida. */
  found: number;
  /** A cuántas les salió una respuesta. */
  answered: number;
};

export async function answerUnansweredInbounds(
  now: Date = new Date(),
): Promise<UnansweredSummary> {
  const waiting = await prisma.conversation.findMany({
    where: {
      // Con el bot en pausa hay una persona al mando: meterse sería peor.
      botPaused: false,
      // El agente vende. A un socio que escribe lo atiende alguien del equipo.
      leadId: { not: null },
      lastInboundAt: {
        not: null,
        lte: new Date(now.getTime() - GRACE_MS),
        gt: new Date(now.getTime() - WINDOW_MS),
      },
      OR: [
        { lastOutboundAt: null },
        { lastOutboundAt: { lt: prisma.conversation.fields.lastInboundAt } },
      ],
    },
    // El que lleva más esperando primero: es el que más cerca está de perderse.
    orderBy: { lastInboundAt: "asc" },
    take: MAX_PER_RUN,
    select: { id: true },
  });

  let answered = 0;
  for (const c of waiting) {
    try {
      // Reusa el camino de siempre, con su lock y sus guardas. Si alguien
      // contestó entre la consulta y ahora, `runLocked` lo ve (el último
      // mensaje ya no es entrante) y no hace nada.
      const res = await respondToInboundConversation(c.id);
      if (res.status === "sent" || (res.status === "handoff" && res.sent)) answered += 1;
    } catch (err) {
      // Que una conversación falle no puede dejar sin atender a las demás.
      console.error("[unanswered] no se pudo responder", c.id, err);
    }
  }

  return { found: waiting.length, answered };
}
