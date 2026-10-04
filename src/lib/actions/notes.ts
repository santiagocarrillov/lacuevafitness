"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function addMemberNote(data: {
  memberId: string;
  content: string;
  visibleToMember?: boolean;
}) {
  const user = await requireAuth();
  if (user.role === "MEMBER") throw new Error("Sin permisos");

  const note = await prisma.memberNote.create({
    data: {
      memberId: data.memberId,
      content: data.content,
      authorId: user.id,
      // Private by default; staff must opt in to share with the socio.
      visibleToMember: data.visibleToMember ?? false,
    },
  });

  revalidatePath(`/dashboard/socios/${data.memberId}`);
  return note;
}

export async function getMemberNotes(memberId: string) {
  // Includes private (staff-only) notes — never for socios.
  const user = await requireAuth();
  if (user.role === "MEMBER") throw new Error("Sin permisos");
  return prisma.memberNote.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { fullName: true } },
    },
  });
}

// No delete on purpose: a note is part of the socio's history ("nunca DELETE").
// The old deleteMemberNote hard-deleted any note for any staff member and had no
// screen left using it, so it was removed (oct 2026).
