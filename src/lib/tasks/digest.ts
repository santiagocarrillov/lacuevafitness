// The 7:30 push: "Hoy tienes N tareas". Only reaches staff who turned on
// "Activar avisos" (push goes through their linked member record). Plain
// module — only the cron calls it.

import { prisma } from "@/lib/prisma";
import { pushToMember } from "@/lib/push/send";
import { todayDateUtc } from "@/lib/timezone";
import { OPEN_STATUSES } from "@/lib/tasks/meta";
import { TASK_ROLES, mineOrPoolWhere } from "@/lib/tasks/scope";
import type { Prisma, User } from "@/generated/prisma/client";

/**
 * Owners and accounting can see every pool, but a daily "13 de la recepción"
 * would be noise for them: the morning push counts the pool only for the
 * admins who work it. (The Resumen and the badge still show it.)
 */
function digestWhere(user: User): Prisma.StaffTaskWhereInput {
  return user.role === "ADMIN" ? mineOrPoolWhere(user) : { assigneeId: user.id };
}

export async function sendTaskDigest(): Promise<{ users: number; notified: number }> {
  const today = todayDateUtc();
  const staff = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: TASK_ROLES },
      member: { pushSubscriptions: { some: {} } },
    },
    include: { member: { select: { id: true } } },
  });

  let notified = 0;
  for (const user of staff) {
    const base = { AND: [digestWhere(user), { status: { in: OPEN_STATUSES } }] };
    const [due, overdue, pool] = await Promise.all([
      prisma.staffTask.count({ where: { AND: [base, { dueDate: { lte: today } }] } }),
      prisma.staffTask.count({ where: { AND: [base, { dueDate: { lt: today } }] } }),
      prisma.staffTask.count({ where: { AND: [base, { dueDate: { lte: today } }, { assigneeId: null }] } }),
    ]);
    if (due === 0 || !user.member) continue;

    const parts = [
      overdue > 0 ? `${overdue} vencida${overdue === 1 ? "" : "s"}` : null,
      pool > 0 ? `${pool} de la recepción` : null,
    ].filter(Boolean);
    await pushToMember(user.member.id, {
      title: `Hoy tienes ${due} tarea${due === 1 ? "" : "s"}`,
      body: `${parts.length ? `${parts.join(" · ")}. ` : ""}Ábrelas y usa Enfocar para ir una por una.`,
      url: "/dashboard/tareas",
    }).catch(() => undefined);
    notified++;
  }
  return { users: staff.length, notified };
}
