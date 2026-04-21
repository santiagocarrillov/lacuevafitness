import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const data = await request.json();

  const bodyComp = await prisma.bodyComposition.create({
    data: {
      memberId: data.memberId,
      weightKg: data.weightKg ? parseFloat(data.weightKg) : undefined,
      heightCm: data.heightCm ? parseFloat(data.heightCm) : undefined,
      bodyFatPct: data.bodyFatPct ? parseFloat(data.bodyFatPct) : undefined,
      muscleMassKg: data.muscleMassKg ? parseFloat(data.muscleMassKg) : undefined,
      waterPct: data.waterPct ? parseFloat(data.waterPct) : undefined,
      basalMetabolism: data.basalMetabolism ? parseInt(data.basalMetabolism) : undefined,
      notes: data.notes || undefined,
    },
  });

  return NextResponse.json(bodyComp);
}
