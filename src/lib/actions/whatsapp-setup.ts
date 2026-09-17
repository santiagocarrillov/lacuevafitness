"use server";

/**
 * WhatsApp number setup (OWNER only).
 *
 * Server-side Graph API calls to finish onboarding a phone number on the Cloud
 * API: diagnostics, list WABA numbers, register a number (two-step PIN) and
 * subscribe the WABA to our app's webhooks. Uses process.env.WHATSAPP_TOKEN,
 * which is never returned, logged or included in error messages.
 *
 * "use server" → only async function exports. Types/helpers live in
 * src/lib/whatsapp/setup-shared.ts.
 */

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import {
  DEFAULT_WABA_ID,
  WHATSAPP_ENV_VARS,
  graphBase,
  graphVersion,
  isNumericId,
  localError,
  parseGraphError,
  type ActionResult,
  type Diagnostics,
  type GraphResult,
  type SubscribedApp,
  type TokenInfo,
  type WabaPhoneNumber,
} from "@/lib/whatsapp/setup-shared";

const PAGE_PATH = "/dashboard/comunicacion/whatsapp-setup";

async function requireOwner() {
  const user = await requireAuth();
  if (user.role !== "OWNER") {
    throw new Error("Solo el OWNER puede configurar el número de WhatsApp.");
  }
  return user;
}

type GraphCall = {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
};

/** Graph request with the env token. Never leaks the token in results. */
async function graph<T>(call: GraphCall): Promise<GraphResult<T>> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return { ok: false, error: localError("WHATSAPP_TOKEN no está configurado.") };

  const url = new URL(`${graphBase()}/${call.path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(call.query ?? {})) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, {
      method: call.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(call.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: call.body !== undefined ? JSON.stringify(call.body) : undefined,
      cache: "no-store",
    });
  } catch {
    // Deliberately generic: fetch errors could include the URL.
    return { ok: false, error: localError("No se pudo conectar con graph.facebook.com.") };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || (json && typeof json === "object" && "error" in json)) {
    return { ok: false, error: parseGraphError(res.status, json) };
  }
  return { ok: true, data: json as T };
}

function strOrNull(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

function resolveWaba(wabaId: string | null | undefined): string {
  const candidate = (wabaId ?? "").trim() || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || DEFAULT_WABA_ID;
  return candidate.trim();
}

export async function getWhatsappDiagnostics(): Promise<Diagnostics> {
  await requireOwner();

  const env = WHATSAPP_ENV_VARS.map((name) => ({
    name,
    set: typeof process.env[name] === "string" && process.env[name]!.length > 0,
  }));

  let token: GraphResult<TokenInfo> | null = null;
  const raw = process.env.WHATSAPP_TOKEN;
  if (raw) {
    const res = await graph<{ data?: Record<string, unknown> }>({
      method: "GET",
      path: "debug_token",
      query: { input_token: raw },
    });
    if (!res.ok) {
      token = res;
    } else {
      const d = res.data.data ?? {};
      const granular = Array.isArray(d.granular_scopes) ? d.granular_scopes : [];
      token = {
        ok: true,
        data: {
          is_valid: typeof d.is_valid === "boolean" ? d.is_valid : null,
          type: strOrNull(d.type),
          app_id: strOrNull(d.app_id),
          application: strOrNull(d.application),
          expires_at: typeof d.expires_at === "number" ? d.expires_at : null,
          data_access_expires_at:
            typeof d.data_access_expires_at === "number" ? d.data_access_expires_at : null,
          scopes: Array.isArray(d.scopes) ? d.scopes.filter((s): s is string => typeof s === "string") : [],
          granular_scopes: granular
            .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
            .map((g) => ({
              scope: strOrNull(g.scope) ?? "?",
              target_ids: Array.isArray(g.target_ids)
                ? g.target_ids.map((t) => strOrNull(t)).filter((t): t is string => !!t)
                : [],
            })),
        },
      };
    }
  }

  return {
    graphVersion: graphVersion(),
    env,
    envPhoneId: process.env.WHATSAPP_PHONE_ID ?? null,
    envWabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? null,
    token,
  };
}

export async function listWabaPhoneNumbers(
  wabaId?: string | null,
): Promise<GraphResult<WabaPhoneNumber[]>> {
  await requireOwner();
  const waba = resolveWaba(wabaId);
  if (!isNumericId(waba)) return { ok: false, error: localError("WABA ID inválido.") };

  const res = await graph<{ data?: Record<string, unknown>[] }>({
    method: "GET",
    path: `${waba}/phone_numbers`,
    query: {
      fields:
        "id,display_phone_number,verified_name,status,code_verification_status,name_status,platform_type,quality_rating,throughput",
      limit: "50",
    },
  });
  if (!res.ok) return res;

  const envPhone = process.env.WHATSAPP_PHONE_ID ?? null;
  const rows = (res.data.data ?? []).map((p) => {
    const throughput = p.throughput;
    const throughputLevel =
      throughput && typeof throughput === "object" && "level" in throughput
        ? strOrNull((throughput as { level?: unknown }).level)
        : strOrNull(throughput);
    const id = strOrNull(p.id) ?? "";
    return {
      id,
      display_phone_number: strOrNull(p.display_phone_number),
      verified_name: strOrNull(p.verified_name),
      status: strOrNull(p.status),
      code_verification_status: strOrNull(p.code_verification_status),
      name_status: strOrNull(p.name_status),
      platform_type: strOrNull(p.platform_type),
      quality_rating: strOrNull(p.quality_rating),
      throughput: throughputLevel,
      isEnvPhone: !!envPhone && envPhone === id,
    };
  });
  return { ok: true, data: rows };
}

export async function registerPhoneNumber(phoneId: string, pin: string): Promise<ActionResult> {
  await requireOwner();
  const id = (phoneId ?? "").trim();
  const code = (pin ?? "").trim();
  if (!isNumericId(id)) return { ok: false, error: localError("Phone number ID inválido.") };
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: localError("El PIN debe tener exactamente 6 dígitos.") };
  }

  const res = await graph<unknown>({
    method: "POST",
    path: `${id}/register`,
    body: { messaging_product: "whatsapp", pin: code },
  });
  revalidatePath(PAGE_PATH);
  return res;
}

export async function getSubscribedApps(
  wabaId?: string | null,
): Promise<GraphResult<SubscribedApp[]>> {
  await requireOwner();
  const waba = resolveWaba(wabaId);
  if (!isNumericId(waba)) return { ok: false, error: localError("WABA ID inválido.") };

  const res = await graph<{ data?: Record<string, unknown>[] }>({
    method: "GET",
    path: `${waba}/subscribed_apps`,
  });
  if (!res.ok) return res;

  const apps = (res.data.data ?? []).map((entry) => {
    const info =
      entry.whatsapp_business_api_data && typeof entry.whatsapp_business_api_data === "object"
        ? (entry.whatsapp_business_api_data as Record<string, unknown>)
        : entry;
    return {
      id: strOrNull(info.id),
      name: strOrNull(info.name),
      link: strOrNull(info.link),
    };
  });
  return { ok: true, data: apps };
}

export async function subscribeAppToWaba(wabaId?: string | null): Promise<ActionResult> {
  await requireOwner();
  const waba = resolveWaba(wabaId);
  if (!isNumericId(waba)) return { ok: false, error: localError("WABA ID inválido.") };

  const res = await graph<unknown>({ method: "POST", path: `${waba}/subscribed_apps` });
  revalidatePath(PAGE_PATH);
  return res;
}
