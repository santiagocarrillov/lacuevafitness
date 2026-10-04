"use server";

/**
 * WhatsApp templates in Meta (OWNER only): list what the WABA has with its
 * review status, and submit the templates of our catalog. Uses the server's
 * WHATSAPP_TOKEN, never returned or logged.
 */

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { DEFAULT_WABA_ID, graphBase, localError, parseGraphError, type GraphError } from "@/lib/whatsapp/setup-shared";
import { TEMPLATE_CATALOG, metaPayload } from "@/lib/whatsapp/template-catalog";

const PAGE = "/dashboard/comunicacion/plantillas";

async function requireOwner() {
  const user = await requireAuth();
  if (user.role !== "OWNER") throw new Error("Solo el dueño puede enviar plantillas a Meta.");
  return user;
}

const waba = () => (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || DEFAULT_WABA_ID).trim();

async function graph<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: GraphError }> {
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

export async function listMetaTemplates(): Promise<{ templates: MetaTemplate[]; error: string | null }> {
  await requireOwner();
  const r = await graph<{ data?: Record<string, unknown>[] }>(
    "GET",
    `${waba()}/message_templates?fields=name,status,category,language,rejected_reason&limit=200`,
  );
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

/** Submits one catalog template for review. Meta answers PENDING (or APPROVED in minutes). */
export async function submitTemplate(name: string): Promise<string> {
  await requireOwner();
  const t = TEMPLATE_CATALOG.find((x) => x.name === name);
  if (!t) throw new Error("Esa plantilla no está en el catálogo.");
  const r = await graph<{ id?: string; status?: string; category?: string }>("POST", `${waba()}/message_templates`, metaPayload(t));
  if (!r.ok) throw new Error(`Meta no la aceptó: ${r.error.message}`);
  revalidatePath(PAGE);
  return r.data.status ?? "PENDING";
}
