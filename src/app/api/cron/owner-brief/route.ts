import { sendTemplate } from "@/lib/whatsapp/client";

// Node runtime (the Graph client) and never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Plantilla de la WABA de La Cueva: categoría MARKETING (Meta rechazó UTILITY), idioma `es`, 5 variables en orden. */
const TEMPLATE = "resumen_diario";
const LANGUAGE = "es";
const VARIABLES = 5;

/**
 * POST /api/cron/owner-brief — manda a Santiago el brief diario del Command Center
 * (~/Grupo Enroke/command-center, collectors/brain.py) por WhatsApp.
 *
 * Body: { "variables": [fecha, titular, accion1, accion2, accion3] }
 *
 * Se reutiliza el número y el token de La Cueva para no sacar el token de Vercel.
 * El destinatario NO viene en el request: sale de OWNER_WHATSAPP, así una fuga de
 * BRAIN_NOTIFY_SECRET no sirve para escribirle a nadie más. Sin secreto o sin
 * número configurado, responde 503 (falla cerrado).
 *
 * El número de Santiago es socio activo: cuando responda, el webhook crea su
 * conversación con botPaused=true (webhook-router → findMemberWithoutConversation),
 * así que el agente de ventas no lo atiende.
 */
export async function POST(request: Request) {
  const secret = process.env.BRAIN_NOTIFY_SECRET;
  const to = process.env.OWNER_WHATSAPP;
  if (!secret || !to) return new Response("not configured", { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("forbidden", { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { variables?: unknown } | null;
  const raw = Array.isArray(body?.variables) ? body.variables : null;
  if (!raw || raw.length !== VARIABLES || raw.some((v) => typeof v !== "string" || !v.trim())) {
    return Response.json({ ok: false, error: `variables: ${VARIABLES} strings no vacíos` }, { status: 400 });
  }
  // Meta rechaza parámetros con saltos de línea, tabs o más de 4 espacios seguidos.
  const variables = (raw as string[]).map((v) => v.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 300));

  try {
    const { messageId } = await sendTemplate(to, TEMPLATE, LANGUAGE, variables);
    return Response.json({ ok: true, messageId });
  } catch (err) {
    console.error("[owner-brief] envío fallido", err);
    return Response.json({ ok: false, error: String(err) }, { status: 502 });
  }
}
