/**
 * The one canonical, socio-facing origin of the app.
 *
 * The app is reachable through several hostnames — the custom domain, the
 * *.vercel.app deployment alias, preview URLs, and localhost in dev — but any
 * link we HAND to a socio (portal invites, auth redirects) or any home-screen
 * PWA install must resolve to this single stable domain. Otherwise a socio who
 * signs up or installs the app from a *.vercel.app URL gets that throwaway URL
 * baked into their phone forever.
 */
export const CANONICAL_SITE_URL = "https://www.lacuevasrxfit.com";

/**
 * The legacy Vercel deployment alias. Human traffic that lands here is 308'd to
 * the canonical domain by the proxy. Preview deploys (lacuevafitness-<hash>.
 * vercel.app) are a DIFFERENT host and are intentionally left alone so the
 * per-branch Preview workflow keeps working.
 */
export const LEGACY_VERCEL_HOST = "lacuevafitness.vercel.app";

/**
 * Resolve the base URL to use for socio-facing links from a given origin.
 * Localhost stays localhost during dev; every other host (the vercel alias,
 * previews, the apex) is normalized to the canonical production domain.
 */
export function publicBaseUrl(origin?: string): string {
  const o =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  if (o.includes("localhost") || o.includes("127.0.0.1")) return o;
  return CANONICAL_SITE_URL;
}
