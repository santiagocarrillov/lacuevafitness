import { Resend } from "resend";

/**
 * Email notification for a new web lead. Plain module (no "use server"): it does
 * no permission check because it's only called from the public form action after
 * the Lead row is already saved.
 *
 * Delivery is best-effort by design — the Lead is persisted first, so a mail
 * outage never costs a prospect. Failures are logged, not thrown.
 */

const API_KEY = process.env.RESEND_API_KEY;
// Sender must be on a domain verified in Resend. Overridable so the domain can
// change without a code edit.
const FROM = process.env.LEAD_NOTIFY_FROM || "La Cueva <web@lacuevasrxfit.com>";
const TO = process.env.LEAD_NOTIFY_TO || "santiago@grupoenroke.com";

export type LeadNotification = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  branchLabel: string;
  leadId: string;
};

export async function notifyNewWebLead(
  lead: LeadNotification,
): Promise<{ sent: boolean; error?: string }> {
  if (!API_KEY) {
    console.warn("[leads/notify] RESEND_API_KEY missing — lead saved, email skipped");
    return { sent: false, error: "RESEND_API_KEY no configurado" };
  }

  const name = `${lead.firstName} ${lead.lastName}`.trim();
  const dashboardUrl = "https://www.lacuevasrxfit.com/dashboard/leads";

  try {
    const resend = new Resend(API_KEY);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [TO],
      replyTo: lead.email,
      subject: `Nuevo lead web — ${name} (${lead.branchLabel})`,
      text: [
        "Alguien llenó el formulario de la web.",
        "",
        `Nombre:   ${name}`,
        `Teléfono: ${lead.phone}`,
        `Correo:   ${lead.email}`,
        `Sucursal: ${lead.branchLabel}`,
        "",
        `Ya está en el CRM: ${dashboardUrl}`,
      ].join("\n"),
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px">
          <h2 style="margin:0 0 4px">Nuevo lead desde la web</h2>
          <p style="color:#555;margin:0 0 16px">Ya quedó registrado en el CRM.</p>
          <table style="border-collapse:collapse;width:100%;font-size:15px">
            <tr><td style="padding:6px 0;color:#777;width:110px">Nombre</td><td style="padding:6px 0"><strong>${esc(name)}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#777">Teléfono</td><td style="padding:6px 0"><a href="tel:${esc(lead.phone)}">${esc(lead.phone)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#777">Correo</td><td style="padding:6px 0"><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#777">Sucursal</td><td style="padding:6px 0">${esc(lead.branchLabel)}</td></tr>
          </table>
          <p style="margin:20px 0 0">
            <a href="${dashboardUrl}" style="background:#0b0b0b;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Ver en el CRM</a>
          </p>
        </div>`,
    });

    if (error) {
      console.error("[leads/notify] resend error", error);
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (err) {
    console.error("[leads/notify] unexpected error", err);
    return { sent: false, error: err instanceof Error ? err.message : "error" };
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
