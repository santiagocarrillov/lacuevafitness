import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";

function randomPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let pw = "";
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function findSupabaseUserByEmail(supabase: ReturnType<typeof adminClient>, email: string) {
  // Paginated lookup; the admin SDK doesn't expose a direct getByEmail
  const lower = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === lower);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function POST(request: Request) {
  const actor = await requireAuth();
  if (!can.manageUsers(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email, fullName, role, sede } = await request.json();
  if (!email || !fullName || !role) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = adminClient();
  const password = randomPassword();
  const existing = await prisma.user.findUnique({ where: { email } });

  // Case 1: active user already exists in our DB → error
  if (existing && existing.active) {
    return NextResponse.json({ error: "Ya existe un usuario activo con ese email." }, { status: 409 });
  }

  // Case 2: inactive user in our DB → reactivate, re-link to Supabase, reset password
  if (existing && !existing.active) {
    let supabaseUserId = existing.supabaseUserId;

    if (supabaseUserId) {
      // Verify it still exists in Supabase
      const { data: lookup } = await supabase.auth.admin.getUserById(supabaseUserId);
      if (!lookup?.user) supabaseUserId = null;
    }

    if (!supabaseUserId) {
      // Try to find or create in Supabase
      const orphan = await findSupabaseUserByEmail(supabase, email);
      if (orphan) {
        supabaseUserId = orphan.id;
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { fullName, role },
        });
        if (error || !data.user) {
          return NextResponse.json({ error: error?.message ?? "Supabase error" }, { status: 500 });
        }
        supabaseUserId = data.user.id;
      }
    }

    // Reset password on the linked Supabase user
    const { error: pwErr } = await supabase.auth.admin.updateUserById(supabaseUserId, { password });
    if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 500 });

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName,
        role,
        sede: sede || null,
        active: true,
        supabaseUserId,
      },
    });
    return NextResponse.json({ password, reactivated: true });
  }

  // Case 3: no local user → try to create in Supabase. If email taken there, link it.
  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { fullName, role },
  });

  let supabaseUserId: string | null = data?.user?.id ?? null;

  if (error && /already|exists|registered/i.test(error.message)) {
    const orphan = await findSupabaseUserByEmail(supabase, email);
    if (!orphan) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    supabaseUserId = orphan.id;
    // Reset password since we don't know the existing one
    const { error: pwErr } = await supabase.auth.admin.updateUserById(orphan.id, { password });
    if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 500 });
  } else if (error || !supabaseUserId) {
    return NextResponse.json({ error: error?.message ?? "Supabase error" }, { status: 500 });
  }

  await prisma.user.create({
    data: {
      email,
      fullName,
      role,
      sede: sede || null,
      supabaseUserId,
      active: true,
    },
  });

  return NextResponse.json({ password });
}
