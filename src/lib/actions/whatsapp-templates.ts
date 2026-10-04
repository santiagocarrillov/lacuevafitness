"use server";

/**
 * WhatsApp templates in Meta (OWNER only): list what the WABA has with its
 * review status, and submit the templates of our catalog. Uses the server's
 * WHATSAPP_TOKEN, never returned or logged.
 */

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { fetchMetaTemplates, graphRequest, wabaId, type MetaTemplate } from "@/lib/whatsapp/graph";
import { TEMPLATE_CATALOG, metaPayload } from "@/lib/whatsapp/template-catalog";

const PAGE = "/dashboard/comunicacion/plantillas";

async function requireOwner() {
  const user = await requireAuth();
  if (user.role !== "OWNER") throw new Error("Solo el dueño puede enviar plantillas a Meta.");
  return user;
}

export type { MetaTemplate };

export async function listMetaTemplates(): Promise<{ templates: MetaTemplate[]; error: string | null }> {
  await requireOwner();
  return fetchMetaTemplates();
}

/** Submits one catalog template for review. Meta answers PENDING (or APPROVED in minutes). */
export async function submitTemplate(name: string): Promise<string> {
  await requireOwner();
  const t = TEMPLATE_CATALOG.find((x) => x.name === name);
  if (!t) throw new Error("Esa plantilla no está en el catálogo.");
  const r = await graphRequest<{ id?: string; status?: string; category?: string }>("POST", `${wabaId()}/message_templates`, metaPayload(t));
  if (!r.ok) throw new Error(`Meta no la aceptó: ${r.error.message}`);
  revalidatePath(PAGE);
  return r.data.status ?? "PENDING";
}
