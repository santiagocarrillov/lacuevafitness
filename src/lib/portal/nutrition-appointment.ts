import { prisma } from "@/lib/prisma";

/**
 * The socio's next nutrition consult, for the portal. Deliberately selects no
 * `notes` — those are staff-only. Caller must pass the session member's id.
 */
export async function getNextNutritionAppointment(memberId: string) {
  // Keep today's already-started consult visible for its duration (+ margin).
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
  return prisma.nutritionAppointment.findFirst({
    where: { memberId, status: "SCHEDULED", startsAt: { gte: since } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      durationMin: true,
      kind: true,
      sede: true,
      staff: { select: { fullName: true } },
    },
  });
}
