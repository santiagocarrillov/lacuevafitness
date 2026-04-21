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

export async function POST(request: Request) {
  const user = await requireAuth();
  if (!can.manageUsers(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email, fullName, role, sede } = await request.json();

  if (!email || !fullName || !role) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Check existing
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un usuario con ese email." }, { status: 409 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const password = randomPassword();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { fullName, role },
  });

  if (error || !data.user) {
    return NextResponse.json({ error: error?.message ?? "Supabase error" }, { status: 500 });
  }

  await prisma.user.create({
    data: {
      email,
      fullName,
      role,
      sede: sede || null,
      supabaseUserId: data.user.id,
      active: true,
    },
  });

  return NextResponse.json({ password });
}
