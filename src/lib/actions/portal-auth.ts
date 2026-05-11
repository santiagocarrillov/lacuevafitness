"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export type PortalSignupResult =
  | { ok: true }
  | { ok: false; error: string };

export async function portalSignUp(formData: FormData): Promise<PortalSignupResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, error: "Ingresa correo y contraseña." };
  }
  if (password.length < 8) {
    return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  }

  // 1. Look up an existing Member by email (case-insensitive via lowercase normalization).
  const member = await prisma.member.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { user: true },
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
      error: "Esta cuenta ya está registrada. Inicia sesión.",
    };
  }

  // 2. Create the Supabase auth user. Email confirmation will be sent if the
  //    Supabase project has it enabled — for self-signup we accept either flow.
  const supabase = await createSupabaseServerClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });
  if (signUpError) {
    return { ok: false, error: signUpError.message };
  }
  const supaUser = signUpData.user;
  if (!supaUser) {
    return { ok: false, error: "No se pudo crear la cuenta. Intenta de nuevo." };
  }

  // 3. Create the internal User row (role MEMBER) and link Member.
  const user = await prisma.user.create({
    data: {
      supabaseUserId: supaUser.id,
      email,
      fullName: `${member.firstName} ${member.lastName}`.trim(),
      phone: member.phone,
      role: "MEMBER",
      sede: member.sede,
      active: true,
    },
  });
  await prisma.member.update({
    where: { id: member.id },
    data: { userId: user.id },
  });

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
