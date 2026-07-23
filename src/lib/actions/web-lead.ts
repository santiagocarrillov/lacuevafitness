"use server";

import { prisma } from "@/lib/prisma";
import { branchByValue } from "@/lib/leads/web-form";
import { notifyNewWebLead } from "@/lib/leads/notify";

export type WebLeadResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v: FormDataEntryValue | null, max = 120): string {
  return String(v ?? "").trim().slice(0, max);
}

/**
 * Public web form → Lead. Unauthenticated on purpose: this is the front door for
 * prospects. The Lead is saved FIRST so a mail outage never loses a prospect;
 * the email notification is best-effort on top.
 */
export async function submitWebLead(formData: FormData): Promise<WebLeadResult> {
  // Honeypot: real people leave this hidden field empty. Silently accept so bots
  // don't learn they were caught.
  if (clean(formData.get("website"))) return { ok: true };

  const firstName = clean(formData.get("firstName"), 60);
  const lastName = clean(formData.get("lastName"), 60);
  const phone = clean(formData.get("phone"), 30);
  const email = clean(formData.get("email"), 120).toLowerCase();
  const branchValue = clean(formData.get("branch"), 20);

  if (!firstName) return { ok: false, error: "Ingresa tu nombre." };
  if (!lastName) return { ok: false, error: "Ingresa tu apellido." };
  if (!phone || phone.replace(/\D/g, "").length < 7) {
    return { ok: false, error: "Ingresa un teléfono válido." };
  }
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Ingresa un correo válido." };

  const branch = branchByValue(branchValue);
  if (!branch) return { ok: false, error: "Elige una sucursal." };

  // Lead.sede is required. "Cualquiera" has no preference, so we default it to
  // Fitness Center for routing and record the actual answer in notes.
  const sede = branch.sede ?? "FITNESS_CENTER";
  const noPreference = branch.sede == null;

  try {
    const lead = await prisma.lead.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        sede,
        source: "WEB_FORM",
        stage: "NEW",
        notes: noPreference
          ? "Formulario web — sin preferencia de sede (eligió “cualquiera”)."
          : `Formulario web — prefiere ${branch.label}.`,
      },
      select: { id: true },
    });

    // Best-effort: never let a mail failure surface as a form error.
    await notifyNewWebLead({
      firstName, lastName, phone, email,
      branchLabel: branch.label,
      leadId: lead.id,
    }).catch(() => undefined);

    return { ok: true };
  } catch (err) {
    console.error("[submitWebLead] error", err);
    return { ok: false, error: "No pudimos enviar tu solicitud. Intenta de nuevo." };
  }
}
