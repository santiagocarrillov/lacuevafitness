import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireAuth();
  if (!can.manageUsers(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { fullName, role, sede, active } = await request.json();

  if (!fullName || !role) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  // Can't demote the only OWNER
  if (target.role === "OWNER" && role !== "OWNER") {
    const ownerCount = await prisma.user.count({ where: { role: "OWNER", active: true } });
    if (ownerCount <= 1) {
      return NextResponse.json({ error: "No puedes cambiar el rol del único Fundador." }, { status: 400 });
    }
  }

  await prisma.user.update({
    where: { id },
    data: {
      fullName,
      role,
      sede: sede || null,
      active: active ?? true,
    },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireAuth();
  if (!can.manageUsers(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (actor.id === id) {
    return NextResponse.json({ error: "No puedes eliminarte a ti mismo." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (target.role === "OWNER") {
    const ownerCount = await prisma.user.count({ where: { role: "OWNER", active: true } });
    if (ownerCount <= 1) {
      return NextResponse.json({ error: "No puedes eliminar al único Fundador." }, { status: 400 });
    }
  }

  // Remove from Supabase Auth so they can't log in
  if (target.supabaseUserId) {
    const supabase = adminClient();
    await supabase.auth.admin.deleteUser(target.supabaseUserId);
  }

  // Soft delete per app convention
  await prisma.user.update({
    where: { id },
    data: { active: false, supabaseUserId: null },
  });

  return NextResponse.json({ success: true });
}
