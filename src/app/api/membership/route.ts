import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  const data = await request.json();

  const membership = await prisma.membership.update({
    where: { id: data.membershipId },
    data: {
      customPriceCents: data.customPriceCents,
      paymentMethod: data.paymentMethod,
      billingNote: data.billingNote,
      endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
    },
  });

  revalidatePath(`/dashboard/socios/${data.memberId}`);
  return NextResponse.json(membership);
}
