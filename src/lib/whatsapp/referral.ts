/**
 * Click-to-WhatsApp (CTWA) ad attribution.
 *
 * When someone taps a Meta ad/post that opens WhatsApp, the FIRST inbound message
 * carries `messages[].referral`. We persist it on the Message (raw) and on the Lead
 * (first touch wins) so we can report cost-per-lead / appointment / member by ad.
 *
 * Pure helpers only — no DB access — so they can be tested with a tsx script.
 */

import type { LeadSource } from "@/generated/prisma/client";

export type WaReferral = {
  source_url?: string;
  source_id?: string;
  source_type?: string; // "ad" | "post"
  headline?: string;
  body?: string;
  media_type?: string;
  image_url?: string;
  video_url?: string;
  thumbnail_url?: string;
  ctwa_clid?: string;
};

/** Returns the referral object when the message has a usable one, else null. */
export function parseReferral(msg: unknown): WaReferral | null {
  const r = (msg as { referral?: unknown } | null)?.referral;
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const ref = r as Record<string, unknown>;
  const str = (k: string) => (typeof ref[k] === "string" && (ref[k] as string).trim() ? (ref[k] as string).trim() : undefined);
  const out: WaReferral = {
    source_url: str("source_url"),
    source_id: str("source_id"),
    source_type: str("source_type"),
    headline: str("headline"),
    body: str("body"),
    media_type: str("media_type"),
    image_url: str("image_url"),
    video_url: str("video_url"),
    thumbnail_url: str("thumbnail_url"),
    ctwa_clid: str("ctwa_clid"),
  };
  // Need at least something that identifies the ad/post.
  if (!out.source_id && !out.source_url && !out.ctwa_clid) return null;
  return out;
}

/** Instagram vs Facebook, inferred from the ad/post URL (default Facebook). */
export function referralLeadSource(ref: WaReferral): LeadSource {
  const url = (ref.source_url ?? "").toLowerCase();
  if (url.includes("instagram.com") || url.includes("instagr.am")) return "INSTAGRAM";
  return "FACEBOOK";
}

/**
 * Sources that are just "how the chat reached us" rather than a real origin —
 * an ad referral may replace them. Anything else (WEB_FORM, REFERRAL, …) is kept.
 */
const REPLACEABLE_SOURCES: LeadSource[] = ["WHATSAPP", "OTHER"];

type LeadAttributionState = {
  source: LeadSource;
  adSourceId: string | null;
  ctwaClid: string | null;
  adSourceUrl: string | null;
};

/**
 * Lead fields to write for a referral. First touch wins: if the lead already has
 * ad attribution, returns {} (nothing to update).
 */
export function leadAttributionUpdate(
  lead: LeadAttributionState,
  ref: WaReferral,
  occurredAt: Date,
): {
  adSourceId?: string | null;
  adSourceType?: string | null;
  adSourceUrl?: string | null;
  adHeadline?: string | null;
  ctwaClid?: string | null;
  adReferredAt?: Date;
  source?: LeadSource;
} {
  if (lead.adSourceId || lead.ctwaClid || lead.adSourceUrl) return {};
  return {
    adSourceId: ref.source_id ?? null,
    adSourceType: ref.source_type ?? null,
    adSourceUrl: ref.source_url ?? null,
    adHeadline: ref.headline ? ref.headline.slice(0, 500) : null,
    ctwaClid: ref.ctwa_clid ?? null,
    adReferredAt: occurredAt,
    ...(REPLACEABLE_SOURCES.includes(lead.source) ? { source: referralLeadSource(ref) } : {}),
  };
}

/** One short line for the sales agent about the ad/post the lead came from. */
export function adContextLine(lead: { adHeadline: string | null; adSourceType: string | null }, adBody?: string | null): string | null {
  const headline = lead.adHeadline?.trim();
  const body = adBody?.trim();
  if (!headline && !body) return null;
  const kind = lead.adSourceType === "post" ? "una publicación" : "un anuncio";
  const parts = [headline ? `"${headline}"` : null, body ? `texto: "${body.slice(0, 200)}"` : null].filter(Boolean);
  return `El lead llegó desde ${kind} de Meta: ${parts.join(" — ")}. Tenlo en cuenta (oferta/tema que le interesó), sin mencionar que es un anuncio.`;
}
