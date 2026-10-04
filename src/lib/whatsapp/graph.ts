// Graph API calls with the server's WHATSAPP_TOKEN (server only, no auth —
// callers check permissions). The token is never returned or logged.

import { DEFAULT_WABA_ID, graphBase, localError, parseGraphError, type GraphError } from "@/lib/whatsapp/setup-shared";

export const wabaId = () => (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || DEFAULT_WABA_ID).trim();

export async function graphRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: GraphError }> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return { ok: false, error: localError("WHATSAPP_TOKEN no está configurado.") };
  let res: Response;
  try {
    res = await fetch(`${graphBase()}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: localError("No se pudo conectar con graph.facebook.com.") };
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok || (json && typeof json === "object" && "error" in json)) return { ok: false, error: parseGraphError(res.status, json) };
  return { ok: true, data: json as T };
}

export type MetaTemplate = { name: string; status: string; category: string; language: string; rejectedReason: string | null };

export async function fetchMetaTemplates(): Promise<{ templates: MetaTemplate[]; error: string | null }> {
  const r = await graphRequest<{ data?: Record<string, unknown>[] }>("GET", `${wabaId()}/message_templates?fields=name,status,category,language,rejected_reason&limit=200`);
  if (!r.ok) return { templates: [], error: r.error.message };
  return {
    templates: (r.data.data ?? []).map((t) => ({
      name: String(t.name ?? ""),
      status: String(t.status ?? ""),
      category: String(t.category ?? ""),
      language: String(t.language ?? ""),
      rejectedReason: t.rejected_reason && t.rejected_reason !== "NONE" ? String(t.rejected_reason) : null,
    })),
    error: null,
  };
}

/** Names of the Spanish templates Meta has approved. */
export async function approvedTemplateNames(): Promise<Set<string>> {
  const { templates } = await fetchMetaTemplates();
  return new Set(templates.filter((t) => t.status === "APPROVED" && t.language.startsWith("es")).map((t) => t.name));
}
