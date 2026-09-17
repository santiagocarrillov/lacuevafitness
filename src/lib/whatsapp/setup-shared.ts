/**
 * WhatsApp number setup — shared types + helpers (plain module, NOT "use server").
 *
 * Used by src/lib/actions/whatsapp-setup.ts (server actions) and the OWNER-only
 * page /dashboard/comunicacion/whatsapp-setup. Nothing here may ever expose the
 * value of WHATSAPP_TOKEN, WHATSAPP_APP_SECRET or WHATSAPP_VERIFY_TOKEN — for
 * those only presence is reported. The rest (phone id, WABA id, feature flags)
 * are not secrets and their value is shown, because a wrong value there is the
 * usual cause of "el agente responde pero no llega nada a WhatsApp".
 */

export const DEFAULT_WABA_ID = "1409189890114741";

/** Env vars whose VALUE must never leave the server. */
export const WHATSAPP_SECRET_ENV_VARS = [
  "WHATSAPP_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
] as const;

/** Env vars relevant to the WhatsApp integration, in display order. */
export const WHATSAPP_ENV_VARS = [
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_GRAPH_VERSION",
  "WHATSAPP_DEFAULT_SEDE",
  "WHATSAPP_AGENT_ENABLED",
  "WHATSAPP_AGENT_AUTOSEND",
  "WHATSAPP_AGENT_MODEL",
  "WHATSAPP_AGENT_EFFORT",
] as const;

export function isSecretEnvVar(name: string): boolean {
  return (WHATSAPP_SECRET_ENV_VARS as readonly string[]).includes(name);
}

export function graphVersion(): string {
  return process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0";
}

export function graphBase(): string {
  return `https://graph.facebook.com/${graphVersion()}`;
}

/**
 * The configured phone number id, normalized: Vercel/`.env` values often arrive
 * with stray whitespace or wrapping quotes, and those never match the id Graph
 * returns, so the number is never badged as "en uso".
 */
export function configuredPhoneId(): string | null {
  const raw = process.env.WHATSAPP_PHONE_ID;
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/^["']|["']$/g, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** Full Graph API error, minus nothing secret (Graph never echoes the token). */
export type GraphError = {
  httpStatus: number | null;
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  /** error.error_data.details — where Cloud API puts the real reason. */
  error_data_details?: string;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
  /** Raw error object as returned by Graph, for anything not mapped above. */
  raw?: unknown;
};

export type GraphResult<T> = { ok: true; data: T } | { ok: false; error: GraphError };

export type EnvPresence = {
  name: string;
  set: boolean;
  /** null for secrets (never sent to the client) and for undefined vars. */
  value: string | null;
  secret: boolean;
};

export type TokenInfo = {
  is_valid: boolean | null;
  type: string | null;
  app_id: string | null;
  application: string | null;
  /** Unix seconds; 0 = never expires. */
  expires_at: number | null;
  data_access_expires_at: number | null;
  scopes: string[];
  granular_scopes: { scope: string; target_ids: string[] }[];
};

export type Diagnostics = {
  graphVersion: string;
  env: EnvPresence[];
  envPhoneId: string | null;
  /** false when WHATSAPP_PHONE_ID is set to something that is not a numeric id. */
  envPhoneIdLooksValid: boolean;
  envWabaId: string | null;
  token: GraphResult<TokenInfo> | null;
};

export type WabaPhoneNumber = {
  id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  status: string | null;
  code_verification_status: string | null;
  name_status: string | null;
  platform_type: string | null;
  quality_rating: string | null;
  throughput: string | null;
  isEnvPhone: boolean;
};

export type SubscribedApp = {
  id: string | null;
  name: string | null;
  link: string | null;
};

/** One OUTBOUND Message row, flattened for the diagnostics table. */
export type OutboundMessageRow = {
  id: string;
  createdAt: string;
  waPhone: string;
  body: string;
  llmGenerated: boolean;
  sentByUserId: string | null;
  externalId: string | null;
  /** True when externalId is set → Cloud API accepted and returned a wamid. */
  delivered: boolean;
};

export type OutboundDiagnostics = {
  messages: OutboundMessageRow[];
  /** Window info for the conversation of the newest outbound message. */
  newest: {
    waPhone: string;
    lastInboundAt: string | null;
    withinWindow: boolean;
    hoursSinceInbound: number | null;
  } | null;
  /**
   * Whether the Message model has a column where a send error could be stored.
   * Today it does not — see the UI note.
   */
  hasErrorField: boolean;
  autoSend: boolean;
};

export type ActionResult = GraphResult<unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

/** Graph puts the useful bit in error.error_data.details (sometimes JSON-encoded). */
function errorDataDetails(err: Record<string, unknown>): string | undefined {
  const ed = err.error_data;
  if (!ed) return undefined;
  if (typeof ed === "string") {
    try {
      const parsed = JSON.parse(ed) as Record<string, unknown>;
      return str(parsed.details) ?? ed;
    } catch {
      return ed;
    }
  }
  if (typeof ed === "object") {
    const details = (ed as Record<string, unknown>).details;
    return str(details) ?? JSON.stringify(ed);
  }
  return undefined;
}

export function parseGraphError(httpStatus: number | null, json: unknown): GraphError {
  const err =
    json && typeof json === "object" && "error" in json
      ? ((json as { error?: Record<string, unknown> }).error ?? {})
      : {};
  return {
    httpStatus,
    message: str(err.message) ?? `Respuesta inesperada de Graph API (HTTP ${httpStatus ?? "?"})`,
    type: str(err.type),
    code: num(err.code),
    error_subcode: num(err.error_subcode),
    error_data_details: errorDataDetails(err),
    error_user_title: str(err.error_user_title),
    error_user_msg: str(err.error_user_msg),
    fbtrace_id: str(err.fbtrace_id),
    raw: Object.keys(err).length > 0 ? err : json,
  };
}

export function localError(message: string): GraphError {
  return { httpStatus: null, message };
}

export function isNumericId(v: string): boolean {
  return /^\d{5,25}$/.test(v);
}

/** E.164-ish: optional leading +, then 8–15 digits. Cloud API wants digits only. */
export function isValidE164(v: string): boolean {
  return /^\+?\d{8,15}$/.test(v.trim());
}

export function normalizePhone(v: string): string {
  return v.trim().replace(/^\+/, "");
}
