import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchInboundMedia, MediaGoneError } from "@/lib/whatsapp/media";

// Graph + Prisma → Node runtime, and never cached at the edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/media/[mediaId] — stream one inbound WhatsApp file (voice
 * note, photo, document) to the inbox.
 *
 * Gated three ways: the caller must be signed-in staff with lead access, the id
 * must belong to a Message we actually stored, and the upstream fetch uses our
 * token server-side — the lookaside URL never reaches the browser.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const { mediaId } = await params;

  const user = await requireAuth();
  if (!can.manageLeads(user)) {
    return new Response("forbidden", { status: 403 });
  }

  // Only ids we ingested — this endpoint is not a proxy for arbitrary Graph media.
  const message = await prisma.message.findFirst({
    where: { mediaId },
    select: { mediaMimeType: true, mediaKind: true },
  });
  if (!message) return new Response("not found", { status: 404 });

  try {
    const media = await fetchInboundMedia(mediaId);
    return new Response(media.body, {
      headers: {
        "Content-Type": media.mimeType || message.mediaMimeType || "application/octet-stream",
        // Meta expires the file in ~30 days; a short private cache keeps scrubbing
        // through a voice note from re-downloading it on every seek.
        "Cache-Control": "private, max-age=600",
        "Content-Disposition": `inline; filename="whatsapp-${message.mediaKind ?? "archivo"}-${mediaId}"`,
      },
    });
  } catch (err) {
    if (err instanceof MediaGoneError) {
      return new Response("media expirada en WhatsApp (más de 30 días)", { status: 410 });
    }
    console.error("[whatsapp-media] fetch failed", { mediaId, err });
    return new Response("no se pudo obtener el archivo", { status: 502 });
  }
}
