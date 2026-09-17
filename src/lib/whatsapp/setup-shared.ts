/**
 * WhatsApp number setup — shared types + helpers (plain module, NOT "use server").
 *
 * Used by src/lib/actions/whatsapp-setup.ts (server actions) and the OWNER-only
 * page /dashboard/comunicacion/whatsapp-setup. Nothing here may ever expose the
 * value of WHATSAPP_TOKEN (or any other secret) — only presence flags and
 * non-secret Graph API fields.
 */

export const DEFAULT_WABA_ID = "1409189890114741";

/** Env vars relevant to the WhatsApp integration. Only presence is reported. */
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

export function graphVersion(): string {
  return process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0";
}

export function graphBase(): string {
  return `https://graph.facebook.com/${graphVersion()}`;
}

/** Full Graph API error, minus nothing secret (Graph never echoes the token). */
export type GraphError = {
  httpStatus: number | null;
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
};

export type GraphResult<T> = { ok: true; data: T } | { ok: false; error: GraphError };

export type EnvPresence = { name: string; set: boolean };

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

export type ActionResult = GraphResult<unknown>;

export function parseGraphError(httpStatus: number | null, json: unknown): GraphError {
  const err =
    json && typeof json === "object" && "error" in json
      ? ((json as { error?: Record<string, unknown> }).error ?? {})
      : {};
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  return {
    httpStatus,
    message: str(err.message) ?? `Respuesta inesperada de Graph API (HTTP ${httpStatus ?? "?"})`,
    type: str(err.type),
    code: num(err.code),
    error_subcode: num(err.error_subcode),
    error_user_title: str(err.error_user_title),
    error_user_msg: str(err.error_user_msg),
    fbtrace_id: str(err.fbtrace_id),
  };
}

export function localError(message: string): GraphError {
  return { httpStatus: null, message };
}

export function isNumericId(v: string): boolean {
  return /^\d{5,25}$/.test(v);
}
