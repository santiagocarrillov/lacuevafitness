import { sendTemplate, sendText } from "@/lib/whatsapp/client";

// Node runtime (the Graph client) and never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plantillas que el Command Center puede mandarle a Santiago, con su número de variables y
 * de botones de respuesta rápida. Idioma `es`, categoría MARKETING (Meta rechazó UTILITY).
 */
const TEMPLATES: Record<string, { variables: number; quickReplies: number }> = {
  resumen_diario: { variables: 5, quickReplies: 0 },
  propuesta_ads: { variables: 5, quickReplies: 2 },
};
const LANGUAGE = "es";

/**
 * POST /api/cron/owner-brief — mensajes del Command Center (~/Grupo Enroke/command-center) a
 * Santiago, usando el número y token de La Cueva sin sacar el token de Vercel.
 *
 * Body: { "template": "resumen_diario", "variables": [...], "quickReplies": [...] }
 *    o  { "text": "..." }  (texto libre: solo llega dentro de la ventana de 24h)
 * Sin "template" se asume resumen_diario (compatibilidad con la primera versión).
 *
 * El destinatario NO viene en el request: sale de OWNER_WHATSAPP, así una fuga de
 * BRAIN_NOTIFY_SECRET no sirve para escribirle a nadie más. Sin configurar → 503.
 */
export async function POST(request: Request) {
  const secret = process.env.BRAIN_NOTIFY_SECRET;
  const to = process.env.OWNER_WHATSAPP;
  if (!secret || !to) return new Response("not configured", { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("forbidden", { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { template?: unknown; variables?: unknown; quickReplies?: unknown; text?: unknown }
    | null;
  if (!body) return Response.json({ ok: false, error: "json inválido" }, { status: 400 });

  try {
    if (typeof body.text === "string" && body.text.trim()) {
      const { messageId } = await sendText(to, body.text.slice(0, 1500));
      return Response.json({ ok: true, messageId });
    }

    const name = typeof body.template === "string" ? body.template : "resumen_diario";
    const spec = TEMPLATES[name];
    if (!spec) return Response.json({ ok: false, error: `plantilla no permitida: ${name}` }, { status: 400 });

    const vars = Array.isArray(body.variables) ? body.variables : [];
    const replies = Array.isArray(body.quickReplies) ? body.quickReplies : [];
    const strings = (xs: unknown[]) => xs.every((v) => typeof v === "string" && v.trim());
    if (vars.length !== spec.variables || !strings(vars) || replies.length !== spec.quickReplies || !strings(replies)) {
      return Response.json(
        { ok: false, error: `${name}: ${spec.variables} variables y ${spec.quickReplies} botones, strings no vacíos` },
        { status: 400 },
      );
    }
    // Meta rechaza parámetros con saltos de línea, tabs o más de 4 espacios seguidos.
    const clean = (v: string, n: number) => v.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, n);
    const { messageId } = await sendTemplate(
      to,
      name,
      LANGUAGE,
      (vars as string[]).map((v) => clean(v, 300)),
      (replies as string[]).map((v) => clean(v, 128)),
    );
    return Response.json({ ok: true, messageId });
  } catch (err) {
    console.error("[owner-brief] envío fallido", err);
    return Response.json({ ok: false, error: String(err) }, { status: 502 });
  }
}
