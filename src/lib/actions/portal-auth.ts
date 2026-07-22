"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";

export type PortalSignupResult =
  | { ok: true }
  | { ok: false; error: string };

/** Canonical form for comparing invite codes: letters/digits only, uppercased. */
function normalizeCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * Portal signup. Access is gated by a one-time invite code the admin issues and
 * sends to the socio. To claim an account the visitor must present the email of
 * an existing Member AND that Member's current, unexpired invite code. This
 * closes the identity-fraud window (member emails are guessable; the code is not)
 * and means a socio always sets their own password.
 *
 * On success the code is consumed (nulled) so it can't be reused. We still handle
 * a pre-existing Supabase auth user (orphan from a prior attempt) by re-confirming
 * and resetting its password — but only after the code check passes.
 */
export async function portalSignUp(formData: FormData): Promise<PortalSignupResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const code = normalizeCode(String(formData.get("code") ?? ""));

  if (!email || !password) {
    return { ok: false, error: "Ingresa correo y contraseña." };
  }
  if (!code) {
    return { ok: false, error: "Ingresa el código que te dio tu admin." };
  }
  if (password.length < 8) {
    return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const member = await prisma.member.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  if (!member) {
    return {
      ok: false,
      error: "No encontramos tu cuenta. Pide a tu admin que active tu portal.",
    };
  }

  if (member.userId) {
    return {
      ok: false,
      error: "Ya tienes una cuenta. Inicia sesión con tu correo y contraseña.",
    };
  }

  // Validate the one-time code: must exist, match, and not be expired.
  const stored = member.portalInviteCode ? normalizeCode(member.portalInviteCode) : null;
  const notExpired =
    member.portalInviteCodeExpiresAt != null &&
    member.portalInviteCodeExpiresAt > new Date();
  if (!stored || !notExpired || stored !== code) {
    return {
      ok: false,
      error: "El código es inválido o expiró. Pide a tu admin uno nuevo.",
    };
  }

  const admin = createSupabaseAdminClient();

  // Look up any existing Supabase auth user with this email — may exist from
  // a stuck previous signup that never got confirmed.
  const { data: existing } = await admin.auth.admin.listUsers();
  const existingAuth = existing?.users.find(
    (u) => u.email?.toLowerCase() === email,
  );

  let supaUserId: string;

  if (existingAuth) {
    // Re-confirm and reset password so the member can finally log in.
    const { error: updateErr } = await admin.auth.admin.updateUserById(
      existingAuth.id,
      { password, email_confirm: true },
    );
    if (updateErr) return { ok: false, error: updateErr.message };
    supaUserId = existingAuth.id;
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) return { ok: false, error: createErr.message };
    if (!created.user) {
      return { ok: false, error: "No se pudo crear la cuenta. Intenta de nuevo." };
    }
    supaUserId = created.user.id;
  }

  // Ensure an internal User row exists and is linked to the Member.
  const dbUser = await prisma.user.upsert({
    where: { email },
    create: {
      supabaseUserId: supaUserId,
      email,
      fullName: `${member.firstName} ${member.lastName}`.trim(),
      phone: member.phone,
      role: "MEMBER",
      sede: member.sede,
      active: true,
    },
    update: { supabaseUserId: supaUserId, active: true },
  });

  // Link the User and consume the invite code so it can't be redeemed again.
  await prisma.member.update({
    where: { id: member.id },
    data: {
      userId: dbUser.id,
      portalInviteCode: null,
      portalInviteCodeExpiresAt: null,
    },
  });

  // Immediately sign them in so they don't have to type the password again.
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signInWithPassword({ email, password });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function portalSignIn(formData: FormData): Promise<PortalSignupResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Ingresa correo y contraseña." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Supabase returns English messages; surface a Spanish one for the common case.
    const friendly = /invalid login credentials/i.test(error.message)
      ? "Correo o contraseña incorrectos."
      : error.message;
    return { ok: false, error: friendly };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Let a logged-in socio set/change their own password from inside the app.
 * Requires an active session (they're already authenticated). Supabase enforces
 * its own minimum, but we require 8 chars to match signup.
 */
export async function portalSetPassword(formData: FormData): Promise<PortalSignupResult> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== confirm) {
    return { ok: false, error: "Las contraseñas no coinciden." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a entrar." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

export async function portalSignOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/portal/login");
}
