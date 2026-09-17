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
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_WABA_ID,
  WHATSAPP_ENV_VARS,
  configuredPhoneId,
  graphBase,
  graphVersion,
  isNumericId,
  isSecretEnvVar,
  isValidE164,
  localError,
  normalizePhone,
  parseGraphError,
  type ActionResult,
  type Diagnostics,
  type GraphResult,
  type OutboundDiagnostics,
  type OutboundMessageRow,
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

  const env = WHATSAPP_ENV_VARS.map((name) => {
    const raw = process.env[name];
    const set = typeof raw === "string" && raw.length > 0;
    const secret = isSecretEnvVar(name);
    return {
      name,
      set,
      // Secrets: presence only. The rest are not secrets and their VALUE is what
      // we need to debug (a wrong phone id or AUTOSEND=false explains everything).
      value: set && !secret ? raw!.trim() : null,
      secret,
    };
  });

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

  const phoneId = configuredPhoneId();
  return {
    graphVersion: graphVersion(),
    env,
    envPhoneId: phoneId,
    envPhoneIdLooksValid: phoneId !== null && isNumericId(phoneId),
    envWabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() ?? null,
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

  const envPhone = configuredPhoneId();
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

/**
 * The Message model (prisma/schema.prisma) has NO error/status column today —
 * a failed send is only console.error'd in agent-runner.ts and the row stays as
 * an indistinguishable draft. Adding one needs a migration, out of scope here.
 */
const MESSAGE_ERROR_FIELD: string | null = null;

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Last 10 OUTBOUND messages + 24h-window status of the newest one. */
export async function getOutboundDiagnostics(): Promise<OutboundDiagnostics> {
  await requireOwner();

  const rows = await prisma.message.findMany({
    where: { direction: "OUTBOUND" },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { conversation: { select: { externalId: true, lastInboundAt: true } } },
  });

  const messages: OutboundMessageRow[] = rows.map((m) => ({
    id: m.id,
    createdAt: m.createdAt.toISOString(),
    waPhone: m.conversation.externalId,
    body: m.body.length > 240 ? `${m.body.slice(0, 240)}…` : m.body,
    llmGenerated: m.llmGenerated,
    sentByUserId: m.sentByUserId,
    externalId: m.externalId,
    delivered: !!m.externalId,
  }));

  const first = rows[0];
  const lastInbound = first?.conversation.lastInboundAt ?? null;
  const newest = first
    ? {
        waPhone: first.conversation.externalId,
        lastInboundAt: lastInbound ? lastInbound.toISOString() : null,
        withinWindow: lastInbound != null && Date.now() - lastInbound.getTime() < WINDOW_MS,
        hoursSinceInbound: lastInbound
          ? Math.round(((Date.now() - lastInbound.getTime()) / 3_600_000) * 10) / 10
          : null,
      }
    : null;

  return {
    messages,
    newest,
    hasErrorField: MESSAGE_ERROR_FIELD !== null,
    autoSend: process.env.WHATSAPP_AGENT_AUTOSEND === "true",
  };
}

/**
 * Send a real plain-text WhatsApp message through the Cloud API and return the
 * FULL Graph response (or the full error). This actually messages the number —
 * the UI warns about it. OWNER only.
 */
export async function sendTestWhatsappMessage(to: string, text: string): Promise<ActionResult> {
  await requireOwner();

  const phoneId = configuredPhoneId();
  if (!phoneId) return { ok: false, error: localError("WHATSAPP_PHONE_ID no está configurado.") };
  if (!isNumericId(phoneId)) {
    return {
      ok: false,
      error: localError(
        `WHATSAPP_PHONE_ID no parece un ID de Graph (valor actual: "${phoneId}"). Debe ser el ID numérico del número, no el número ni el nombre de la variable.`,
      ),
    };
  }

  const dest = (to ?? "").trim();
  if (!isValidE164(dest)) {
    return {
      ok: false,
      error: localError("Número inválido. Usa formato E.164: solo dígitos, opcionalmente con + (ej. +593981781969)."),
    };
  }
  const body = (text ?? "").trim();
  if (!body) return { ok: false, error: localError("El mensaje de prueba está vacío.") };
  if (body.length > 1000) return { ok: false, error: localError("El mensaje de prueba es demasiado largo (máx. 1000).") };

  const res = await graph<unknown>({
    method: "POST",
    path: `${phoneId}/messages`,
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizePhone(dest),
      type: "text",
      text: { preview_url: false, body },
    },
  });
  revalidatePath(PAGE_PATH);
  return res;
}
