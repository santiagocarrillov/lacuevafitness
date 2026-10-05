/**
 * Botones que Santiago toca en mensajes del Command Center (~/Grupo Enroke/command-center).
 *
 * La plantilla `propuesta_ads` trae dos respuestas rápidas con payload
 * `ads:aprobada:<uuid>` / `ads:rechazada:<uuid>`. Cuando las toca, Meta manda un mensaje
 * `type: "button"` a este webhook. Aquí se reenvía la decisión al Command Center y se le
 * confirma por WhatsApp. El mensaje igual se guarda como cualquier otro (webhook-router);
 * su conversación es de socio, así que el agente de ventas no responde.
 *
 * Solo se aceptan botones que vengan de OWNER_WHATSAPP y con el prefijo `ads:`.
 *
 * También acepta texto libre de Santiago para la libreta de los agentes (ops.agent_notes):
 *   "nota: …"     → nota que leen el Brain, el agente de Ads y Claude
 *   "por qué: …"  → motivo de la última propuesta de Ads que decidió (2 h); si no hay, queda como nota
 */
import { sendText } from "./client";

type OwnerButton = { from: string; payload: string };

const DECISION = /^ads:(aprobada|rechazada):([0-9a-f-]{36})$/;

export function extractOwnerButtons(payload: unknown): OwnerButton[] {
  const owner = process.env.OWNER_WHATSAPP;
  if (!owner) return [];
  const out: OwnerButton[] = [];
  const entries = (payload as { entry?: { changes?: { value?: { messages?: unknown[] } }[] }[] })?.entry ?? [];
  for (const e of entries) {
    for (const c of e.changes ?? []) {
      for (const m of (c.value?.messages ?? []) as { from?: string; type?: string; button?: { payload?: string } }[]) {
        if (m.from === owner && m.type === "button" && m.button?.payload?.startsWith("ads:")) {
          out.push({ from: m.from, payload: m.button.payload });
        }
      }
    }
  }
  return out;
}

export async function handleOwnerButtons(buttons: OwnerButton[]): Promise<void> {
  const url = process.env.COMMAND_CENTER_URL;
  const secret = process.env.ADS_DECIDE_SECRET;
  for (const b of buttons) {
    const match = DECISION.exec(b.payload);
    if (!match || !url || !secret) continue;
    const [, decision, id] = match;
    let reply: string;
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/api/ads/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, via: "whatsapp" }),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: string; title?: string };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      reply =
        json.status === "aprobada"
          ? `✅ Aprobada: ${json.title}. Se aplica en los próximos 15 minutos y te aviso.`
          : json.status === "manual"
            ? `📝 Aprobada: ${json.title}. Es un cambio manual: quedó como tarea en tu Command Center.`
            : json.status === "rechazada"
              ? `❌ Rechazada: ${json.title}. No se toca nada. Si quieres, responde «por qué: …» y el agente no la vuelve a proponer.`
              : `Esa propuesta ya no estaba pendiente (${json.status ?? "desconocida"}).`;
    } catch (err) {
      console.error("[owner-commands] no se pudo registrar la decisión", err);
      reply = "⚠️ No pude registrar tu respuesta. Apruébala desde el Command Center.";
    }
    try {
      await sendText(b.from, reply);
    } catch (err) {
      console.error("[owner-commands] no se pudo confirmar", err);
    }
  }
}

type OwnerNote = { from: string; kind: "nota" | "porque"; text: string };

// "nota: …", "Nota - …", "por qué: …", "porque: …", "por que …" (con o sin tilde, mayúsculas indistintas).
const NOTE = /^\s*(nota|por\s*qu[eé]|porqu[eé])\s*[:\-–]\s*([\s\S]+)$/i;

export function parseOwnerNote(body: string): { kind: "nota" | "porque"; text: string } | null {
  const m = NOTE.exec(body);
  if (!m) return null;
  const text = m[2].trim();
  if (!text) return null;
  return { kind: m[1].toLowerCase().startsWith("nota") ? "nota" : "porque", text };
}

export function extractOwnerNotes(payload: unknown): OwnerNote[] {
  const owner = process.env.OWNER_WHATSAPP;
  if (!owner) return [];
  const out: OwnerNote[] = [];
  const entries = (payload as { entry?: { changes?: { value?: { messages?: unknown[] } }[] }[] })?.entry ?? [];
  for (const e of entries) {
    for (const c of e.changes ?? []) {
      for (const m of (c.value?.messages ?? []) as { from?: string; type?: string; text?: { body?: string } }[]) {
        if (m.from !== owner || m.type !== "text" || !m.text?.body) continue;
        const note = parseOwnerNote(m.text.body);
        if (note) out.push({ from: m.from, ...note });
      }
    }
  }
  return out;
}

export async function handleOwnerNotes(notes: OwnerNote[]): Promise<void> {
  const url = process.env.COMMAND_CENTER_URL;
  const secret = process.env.ADS_DECIDE_SECRET;
  if (!url || !secret) return;
  for (const n of notes) {
    let reply: string;
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/api/notes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ kind: n.kind, text: n.text }),
      });
      const json = (await res.json().catch(() => ({}))) as { reply?: string };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      reply = `📒 ${json.reply ?? "Nota guardada."}`;
    } catch (err) {
      console.error("[owner-commands] no se pudo guardar la nota", err);
      reply = "⚠️ No pude guardar tu nota. Escríbela en Command Center → Notas.";
    }
    try {
      await sendText(n.from, reply);
    } catch (err) {
      console.error("[owner-commands] no se pudo confirmar la nota", err);
    }
  }
}
