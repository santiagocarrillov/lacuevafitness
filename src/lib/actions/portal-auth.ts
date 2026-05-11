"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";

export type PortalSignupResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Portal signup. The security boundary is membership pre-registration: the
 * Member row must already exist (admin added them). Once that's true, email
 * confirmation adds no real security, so we auto-confirm via the admin API.
 *
 * Idempotent: if a previous attempt left a half-finished Supabase auth user
 * (e.g. they signed up before this auto-confirm change shipped and got stuck
 * with "email not confirmed"), this re-confirms it and resets the password.
 */
export async function portalSignUp(formData: FormData): Promise<PortalSignupResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, error: "Ingresa correo y contraseña." };
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

  if (member.userId !== dbUser.id) {
    await prisma.member.update({
      where: { id: member.id },
      data: { userId: dbUser.id },
    });
  }

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
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function portalSignOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/portal/login");
}
