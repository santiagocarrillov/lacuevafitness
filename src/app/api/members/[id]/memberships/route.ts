import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const memberships = await prisma.membership.findMany({
    where: { memberId: id, state: { in: ["ACTIVE", "PENDING_PAYMENT"] } },
    orderBy: { endsAt: "desc" },
    include: { plan: { select: { name: true } } },
    take: 10,
  });

  return NextResponse.json(
    memberships.map((m) => ({
      id: m.id,
      plan: { name: m.plan.name },
      endsAt: m.endsAt.toISOString(),
    }))
  );
}
