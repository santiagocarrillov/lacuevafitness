"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function addMemberNote(data: {
  memberId: string;
  content: string;
  authorId?: string;
}) {
  const note = await prisma.memberNote.create({
    data: {
      memberId: data.memberId,
      content: data.content,
      authorId: data.authorId || undefined,
    },
  });

  revalidatePath(`/dashboard/socios/${data.memberId}`);
  return note;
}

export async function getMemberNotes(memberId: string) {
  return prisma.memberNote.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { fullName: true } },
    },
  });
}

export async function deleteMemberNote(noteId: string, memberId: string) {
  await prisma.memberNote.delete({ where: { id: noteId } });
  revalidatePath(`/dashboard/socios/${memberId}`);
}
