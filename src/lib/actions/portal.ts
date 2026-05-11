"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type JoinChallengeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function joinChallenge(challengeId: string): Promise<JoinChallengeResult> {
  const { member } = await requireMember();

  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge || !challenge.active) {
    return { ok: false, error: "Reto no disponible." };
  }
  const now = new Date();
  if (challenge.startsAt > now || challenge.endsAt < now) {
    return { ok: false, error: "Reto fuera de fecha." };
  }
  if (challenge.sede && challenge.sede !== member.sede) {
    return { ok: false, error: "Reto no disponible en tu sede." };
  }

  await prisma.challengeProgress.upsert({
    where: {
      challengeId_memberId: { challengeId, memberId: member.id },
    },
    create: { challengeId, memberId: member.id, currentCount: 0 },
    update: {},
  });

  revalidatePath("/portal/retos");
  return { ok: true };
}
