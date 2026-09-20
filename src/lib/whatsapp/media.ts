/**
 * Inbound WhatsApp media (voice notes, photos, documents).
 *
 * Meta never pushes the file itself — the webhook only carries a media id. Fetching
 * it is two hops: GET /{media-id} returns a short-lived lookaside URL, and that URL
 * must be fetched with the same bearer token. We do both on demand from
 * /api/whatsapp/media/[mediaId] instead of copying files into our own storage:
 * nothing to back up, no public URLs, and the dashboard's auth is the only gate.
 *
 * Trade-off worth knowing: Meta retains the binary for ~30 days. After that the id
 * 404s and the inbox shows "ya no disponible". The message row (and its placeholder
 * in the transcript) survives regardless. If we ever need permanent audio — for
 * transcription history or disputes — this is the seam where a copy-to-storage step
 * would go.
 */

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0";

function token(): string {
  const t = process.env.WHATSAPP_TOKEN;
  if (!t) throw new Error("WHATSAPP_TOKEN not set");
  return t;
}

export type MediaPayload = {
  body: ArrayBuffer;
  mimeType: string;
  fileSize: number | null;
};

export class MediaGoneError extends Error {
  constructor(mediaId: string) {
    super(`media ${mediaId} no longer available upstream`);
    this.name = "MediaGoneError";
  }
}

/** Resolve a media id to its short-lived download URL (valid ~5 min). */
async function resolveMediaUrl(mediaId: string): Promise<{ url: string; mimeType: string; fileSize: number | null }> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: "no-store",
  });
  if (res.status === 404 || res.status === 400) throw new MediaGoneError(mediaId);
  if (!res.ok) throw new Error(`media lookup ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!json.url) throw new MediaGoneError(mediaId);
  return {
    url: json.url,
    mimeType: json.mime_type ?? "application/octet-stream",
    fileSize: typeof json.file_size === "number" ? json.file_size : null,
  };
}

/** Download an inbound media file by id. Throws MediaGoneError once Meta has expired it. */
export async function fetchInboundMedia(mediaId: string): Promise<MediaPayload> {
  const { url, mimeType, fileSize } = await resolveMediaUrl(mediaId);
  // The lookaside URL still needs the bearer token — it is not a public link.
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
  if (res.status === 404 || res.status === 410) throw new MediaGoneError(mediaId);
  if (!res.ok) throw new Error(`media download ${res.status}`);
  return { body: await res.arrayBuffer(), mimeType, fileSize };
}

// ── Transcript labels ───────────────────────────────────────────────────────

/** Human label for the inbox + the placeholder body we store on the Message row. */
export function mediaPlaceholder(kind: string, voice: boolean): string {
  if (kind === "audio") return voice ? "[nota de voz]" : "[audio]";
  return `[${kind}]`;
}

/**
 * What the agent sees in place of a file it cannot open. Explicit on purpose: the
 * bare "[audio]" we used to store read like ordinary text, so the model answered a
 * voice note as if it had heard it. See the media rule in agent.ts.
 */
export function mediaTurnMarker(kind: string, voice: boolean, caption: string | null): string {
  const what =
    kind === "audio"
      ? voice
        ? "una NOTA DE VOZ"
        : "un archivo de AUDIO"
      : kind === "image"
        ? "una IMAGEN"
        : kind === "video"
          ? "un VIDEO"
          : kind === "document"
            ? "un DOCUMENTO"
            : kind === "sticker"
              ? "un STICKER"
              : "un ARCHIVO";
  const base = `[El cliente envió ${what}. NO puedes verlo ni escucharlo: por este canal solo te llega texto.]`;
  return caption ? `${base} Escribió junto al archivo: "${caption}"` : base;
}
