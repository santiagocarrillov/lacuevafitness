import { prisma } from "@/lib/prisma";
import { pushToMember } from "./send";
import { formatAppointmentWhen, selectAppointmentsToRemind } from "@/lib/nutrition/appointments";

/**
 * Daily cron job: push "tu cita es mañana" to every socio with a nutrition
 * appointment on the next Ecuador day, once (stamped in reminderSentAt).
 * Sends REAL pushes — never call it just to "check" it; test the pure selector.
 */
export async function sendNutritionAppointmentReminders(now: Date = new Date()) {
  // Coarse DB window (next ~2 days); the exact "tomorrow in Ecuador" cut is the pure selector.
  const candidates = await prisma.nutritionAppointment.findMany({
    where: {
      status: "SCHEDULED",
      reminderSentAt: null,
      startsAt: { gte: now, lt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true, memberId: true, startsAt: true, status: true, reminderSentAt: true },
  });

  const due = selectAppointmentsToRemind(candidates, now);
  let sent = 0;
  for (const a of due) {
    const r = await pushToMember(a.memberId, {
      title: "Mañana tienes cita con la nutricionista",
      body: `Te esperamos el ${formatAppointmentWhen(a.startsAt)}.`,
      url: "/portal/nutricion",
    }).catch(() => ({ sent: 0, failed: 1 }));
    sent += r.sent;
    // Stamp even without a device: the reminder was "due" once; don't retry forever.
    await prisma.nutritionAppointment.update({
      where: { id: a.id },
      data: { reminderSentAt: now },
    });
  }
  return { due: due.length, sent };
}
