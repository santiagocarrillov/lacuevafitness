import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publicBaseUrl } from "@/lib/site-url";

/**
 * Password recovery for socios (and any account with a Supabase auth user).
 *
 * Plain module (no "use server"): callers are server actions / route handlers
 * that already did their own permission check.
 *
 * We do NOT use `supabase.auth.resetPasswordForEmail` because that relies on
 * Supabase's built-in mailer (hard rate limits, English copy, generic sender).
 * Instead we mint the recovery token with the service-role key and deliver it
 * ourselves through Resend — same transport as the web lead notification — so
 * the email is in Spanish, on our domain, and not rate-limited.
 *
 * The link points at /auth/confirm, which exchanges the hashed token for a
 * session cookie and drops the socio on the "set a new password" screen.
 */

const API_KEY = process.env.RESEND_API_KEY;
// Sender must live on a domain verified in Resend. Falls back to the lead
// notifier's sender so no new env var is required to ship this.
const FROM =
  process.env.PORTAL_MAIL_FROM ||
  process.env.LEAD_NOTIFY_FROM ||
  "La Cueva <web@lacuevasrxfit.com>";

/** How long a recovery link stays usable, in hours (matches Supabase default). */
const LINK_TTL_HOURS = 24;

/** Minimum gap between two self-service requests for the same address. */
const THROTTLE_MS = 60_000;

/**
 * Per-instance throttle for the PUBLIC form. Serverless means this is per lambda,
 * not global — enough to stop a trivial "hit send 200 times" loop from mailing a
 * socio over and over, which is all it needs to do. Admin-initiated recoveries
 * skip it (they already passed a permission check).
 */
const lastRequestByEmail = new Map<string, number>();

export function throttleRecovery(email: string): boolean {
  const now = Date.now();
  const prev = lastRequestByEmail.get(email);
  if (prev && now - prev < THROTTLE_MS) return false;
  lastRequestByEmail.set(email, now);
  // Keep the map from growing without bound on a long-lived instance.
  if (lastRequestByEmail.size > 500) {
    for (const [k, t] of lastRequestByEmail) {
      if (now - t > THROTTLE_MS) lastRequestByEmail.delete(k);
    }
  }
  return true;
}

export type RecoveryResult =
  | { ok: true; link: string; emailed: boolean; emailError?: string }
  | { ok: false; error: string };

/**
 * Mint a one-time recovery link for `email` and email it to the socio.
 *
 * Returns the link itself so an admin doing troubleshooting can also paste it
 * into WhatsApp — the channel socios actually read. That grants no privilege an
 * admin doesn't already have (they can set a temporary password directly).
 */
export async function createPasswordRecovery(
  email: string,
  opts: { origin?: string; sendEmail?: boolean; memberName?: string } = {},
): Promise<RecoveryResult> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error) {
    // Most common cause: no auth user for that address (never claimed the app).
    return { ok: false, error: error.message };
  }

  const hashedToken = data?.properties?.hashed_token;
  if (!hashedToken) {
    return { ok: false, error: "No se pudo generar el enlace. Intenta de nuevo." };
  }

  const base = publicBaseUrl(opts.origin);
  const link =
    `${base}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}` +
    `&type=recovery&next=${encodeURIComponent("/portal/nueva-clave")}`;

  if (opts.sendEmail === false) {
    return { ok: true, link, emailed: false };
  }

  const sent = await sendRecoveryEmail(email, link, opts.memberName);
  return { ok: true, link, emailed: sent.sent, emailError: sent.error };
}

async function sendRecoveryEmail(
  email: string,
  link: string,
  memberName?: string,
): Promise<{ sent: boolean; error?: string }> {
  if (!API_KEY) {
    console.warn("[account/recovery] RESEND_API_KEY missing — link generated, email skipped");
    return { sent: false, error: "RESEND_API_KEY no configurado" };
  }

  const hi = memberName ? `Hola ${memberName.split(" ")[0]},` : "Hola,";

  try {
    const resend = new Resend(API_KEY);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [email],
      subject: "Recupera tu contraseña — La Cueva",
      text: [
        hi,
        "",
        "Pediste recuperar el acceso a tu portal de socio de La Cueva.",
        "Abre este enlace para crear una contraseña nueva:",
        "",
        link,
        "",
        `El enlace sirve una sola vez y caduca en ${LINK_TTL_HOURS} horas.`,
        "Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando.",
      ].join("\n"),
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px">
          <h2 style="margin:0 0 4px">Recupera tu contraseña</h2>
          <p style="color:#555;margin:0 0 16px">${esc(hi)} pediste recuperar el acceso a tu portal de socio de La Cueva.</p>
          <p style="margin:0 0 20px">
            <a href="${esc(link)}" style="background:#0b0b0b;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Crear contraseña nueva</a>
          </p>
          <p style="color:#777;font-size:13px;margin:0 0 8px">
            El enlace sirve una sola vez y caduca en ${LINK_TTL_HOURS} horas.
          </p>
          <p style="color:#777;font-size:13px;margin:0">
            Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando.
          </p>
        </div>`,
    });

    if (error) {
      console.error("[account/recovery] resend error", error);
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (err) {
    console.error("[account/recovery] unexpected error", err);
    return { sent: false, error: err instanceof Error ? err.message : "error" };
  }
}

/**
 * Email a socio their one-time portal invite code. The admin still sees the code
 * on screen (WhatsApp remains the main channel) — this just saves the copy-paste
 * when the socio does read email.
 */
export async function sendPortalInviteEmail(args: {
  email: string;
  code: string;
  expiresAt: Date;
  memberName?: string;
  origin?: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!API_KEY) {
    console.warn("[account/recovery] RESEND_API_KEY missing — invite email skipped");
    return { sent: false, error: "RESEND_API_KEY no configurado" };
  }

  const url = `${publicBaseUrl(args.origin)}/portal/signup`;
  const hi = args.memberName ? `Hola ${args.memberName.split(" ")[0]},` : "Hola,";
  const expiry = args.expiresAt.toLocaleDateString("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  try {
    const resend = new Resend(API_KEY);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [args.email],
      subject: "Activa tu portal de socio — La Cueva",
      text: [
        hi,
        "",
        "Ya puedes activar tu portal de socio de La Cueva.",
        "",
        `Correo:  ${args.email}`,
        `Código:  ${args.code}`,
        `Entra a: ${url}`,
        "",
        `El código sirve una sola vez y caduca el ${expiry}.`,
      ].join("\n"),
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px">
          <h2 style="margin:0 0 4px">Activa tu portal de socio</h2>
          <p style="color:#555;margin:0 0 16px">${esc(hi)} ya puedes entrar al portal de La Cueva.</p>
          <table style="border-collapse:collapse;width:100%;font-size:15px">
            <tr><td style="padding:6px 0;color:#777;width:80px">Correo</td><td style="padding:6px 0"><strong>${esc(args.email)}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#777">Código</td><td style="padding:6px 0"><strong style="font-family:ui-monospace,monospace;letter-spacing:1px">${esc(args.code)}</strong></td></tr>
          </table>
          <p style="margin:20px 0 0">
            <a href="${esc(url)}" style="background:#0b0b0b;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Crear mi cuenta</a>
          </p>
          <p style="color:#777;font-size:13px;margin:16px 0 0">
            El código sirve una sola vez y caduca el ${esc(expiry)}.
          </p>
        </div>`,
    });

    if (error) {
      console.error("[account/recovery] invite resend error", error);
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (err) {
    console.error("[account/recovery] invite unexpected error", err);
    return { sent: false, error: err instanceof Error ? err.message : "error" };
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
