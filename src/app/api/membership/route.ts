import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";

export async function PATCH(request: Request) {
  const user = await requireAuth();
  if (!can.editMembership(user)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const data = await request.json();

  if (data.startsAt && data.endsAt && data.startsAt > data.endsAt) {
    return NextResponse.json(
      { error: "La fecha de inicio no puede ser posterior al vencimiento." },
      { status: 400 },
    );
  }

  const membership = await prisma.membership.update({
    where: { id: data.membershipId },
    data: {
      // planId lets an admin fix a wrongly-assigned plan (e.g. Fitness → Xtreme).
      ...(data.planId ? { planId: data.planId } : {}),
      customPriceCents: data.customPriceCents,
      paymentMethod: data.paymentMethod,
      billingNote: data.billingNote,
      startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
      endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
    },
  });

  revalidatePath(`/dashboard/socios/${data.memberId}`);
  return NextResponse.json(membership);
}
