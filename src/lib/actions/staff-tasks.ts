"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSedeScope, can } from "@/lib/auth";
import { todayDateUtc, ecuadorDateAt, ecuadorDateString } from "@/lib/timezone";
import type { Prisma, User, UserRole } from "@/generated/prisma/client";
import {
  OPEN_STATUSES,
  STATUS_LABEL,
  TYPE_LABEL,
  dueLabel,
  priorityLabel,
  timeToMinutes,
  type AssignableUser,
  type PersonRef,
  type PersonSearchResult,
  type SedeValue,
  type TaskDetail,
  type TaskListItem,
  type TaskStatus,
  type TaskType,
  type TaskView,
} from "@/lib/tasks/meta";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// Everyone on staff can send and receive tasks (decided 28 sep 2026).
const TASK_ROLES: UserRole[] = ["OWNER", "ACCOUNTING", "ADMIN", "COACH", "NUTRITIONIST"];

async function requireTaskUser(): Promise<User> {
  const user = await requireAuth();
  if (!TASK_ROLES.includes(user.role)) throw new Error("Sin permisos.");
  return user;
}

/** Owners and accounting see every task, as they did in the first version. */
function seesAll(user: User) {
  return user.role === "OWNER" || user.role === "ACCOUNTING";
}

/**
 * Unassigned tasks of a sede — the front desk's pool. Only the roles that run
 * the front desk work it; an admin sees their sede plus the both-sedes pool.
 */
function poolWhere(user: User): Prisma.StaffTaskWhereInput | null {
  if (!can.manageLeads(user)) return null;
  const scope = getSedeScope(user);
  return {
    assigneeId: null,
    ...(scope ? { OR: [{ sede: scope }, { sede: null }] } : {}),
  };
}

/**
 * What a user may see (and therefore edit): tasks they hold or handed out,
 * their pool, and the parent/children of any of those so a subtask never
 * dangles without context.
 */
function visibleWhere(user: User): Prisma.StaffTaskWhereInput {
  if (seesAll(user)) return {};
  const own: Prisma.StaffTaskWhereInput = {
    OR: [{ assigneeId: user.id }, { createdById: user.id }],
  };
  const pool = poolWhere(user);
  const base = pool ? { OR: [own, pool] } : own;
  return {
    OR: [base, { parent: base }, { subtasks: { some: base } }],
  };
}

function viewWhere(user: User, view: TaskView): Prisma.StaffTaskWhereInput | null {
  switch (view) {
    case "mine":
      return { assigneeId: user.id };
    case "assigned":
      // `not` alone would drop the ones left in the pool (NULL <> x is NULL).
      return {
        createdById: user.id,
        OR: [{ assigneeId: null }, { assigneeId: { not: user.id } }],
      };
    case "pool":
      return poolWhere(user);
    case "all":
      return seesAll(user) ? {} : null;
  }
}

export async function getAvailableViews(): Promise<TaskView[]> {
  const user = await requireTaskUser();
  const views: TaskView[] = ["mine", "assigned"];
  if (poolWhere(user)) views.push("pool");
  if (seesAll(user)) views.push("all");
  return views;
}

// ─── mapping ───────────────────────────────────────────────────────────────

const personName = (p: { firstName: string; lastName: string | null }) =>
  [p.firstName, p.lastName].filter(Boolean).join(" ").trim();

const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const listInclude = {
  assignee: { select: { id: true, fullName: true } },
  lead: { select: { id: true, firstName: true, lastName: true } },
  member: { select: { id: true, firstName: true, lastName: true } },
  parent: { select: { title: true } },
  doneBy: { select: { fullName: true } },
  subtasks: { where: { status: { not: "CANCELED" } }, select: { status: true } },
} satisfies Prisma.StaffTaskInclude;

type ListRow = Prisma.StaffTaskGetPayload<{ include: typeof listInclude }>;

function toPerson(t: Pick<ListRow, "lead" | "member">): PersonRef | null {
  if (t.member) return { kind: "member", id: t.member.id, name: personName(t.member) };
  if (t.lead) return { kind: "lead", id: t.lead.id, name: personName(t.lead) };
  return null;
}

function toListItem(t: ListRow): TaskListItem {
  return {
    id: t.id,
    title: t.title,
    type: t.type,
    status: t.status,
    priority: t.priority,
    sede: t.sede,
    dueDate: dateOnly(t.dueDate),
    dueMinutes: t.dueMinutes,
    assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.fullName } : null,
    person: toPerson(t),
    parentTitle: t.parent?.title ?? null,
    subtaskCount: t.subtasks.length,
    subtaskDone: t.subtasks.filter((s) => s.status === "DONE").length,
    doneAt: t.doneAt?.toISOString() ?? null,
    doneByName: t.doneBy?.fullName ?? null,
    outcome: t.outcome,
  };
}

const listOrder: Prisma.StaffTaskOrderByWithRelationInput[] = [
  { dueDate: { sort: "asc", nulls: "last" } },
  { dueMinutes: { sort: "asc", nulls: "last" } },
  { priority: "desc" },
  { createdAt: "asc" },
];

// ─── reads ─────────────────────────────────────────────────────────────────

/**
 * One tab of /dashboard/tareas. Open tasks by default; `closed` shows what
 * was closed or canceled in the last 14 days instead.
 */
export async function listTasks(view: TaskView, closed = false): Promise<TaskListItem[]> {
  const user = await requireTaskUser();
  const scope = viewWhere(user, view);
  if (!scope) return [];

  const since = new Date(Date.now() - 14 * 86_400_000);
  const rows = await prisma.staffTask.findMany({
    where: {
      AND: [
        visibleWhere(user),
        scope,
        closed
          ? { status: { in: ["DONE", "CANCELED"] }, updatedAt: { gte: since } }
          : { status: { in: OPEN_STATUSES } },
      ],
    },
    orderBy: closed ? [{ updatedAt: "desc" }] : listOrder,
    include: listInclude,
    take: 300,
  });
  return rows.map(toListItem);
}

/** Open-task count per tab, for the tab badges. */
export async function countOpenTasks(): Promise<Partial<Record<TaskView, number>>> {
  const user = await requireTaskUser();
  const views = await getAvailableViews();
  const counts = await Promise.all(
    views.map((v) =>
      prisma.staffTask.count({
        where: {
          AND: [visibleWhere(user), viewWhere(user, v)!, { status: { in: OPEN_STATUSES } }],
        },
      }),
    ),
  );
  return Object.fromEntries(views.map((v, i) => [v, counts[i]]));
}

export async function getTaskDetail(id: string): Promise<TaskDetail | null> {
  const user = await requireTaskUser();
  const t = await prisma.staffTask.findFirst({
    where: { AND: [{ id }, visibleWhere(user)] },
    include: {
      ...listInclude,
      parent: { select: { id: true, title: true } },
      createdBy: { select: { id: true, fullName: true } },
      lead: {
        select: { id: true, firstName: true, lastName: true, conversation: { select: { id: true } } },
      },
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          conversation: { select: { id: true } },
          lead: { select: { conversation: { select: { id: true } } } },
        },
      },
      subtasks: {
        where: { status: { not: "CANCELED" } },
        orderBy: [{ createdAt: "asc" }],
        include: listInclude,
      },
      links: { orderBy: { createdAt: "asc" } },
      entries: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, fullName: true } } },
      },
    },
  });
  if (!t) return null;

  const conversationId =
    t.lead?.conversation?.id ??
    t.member?.conversation?.id ??
    t.member?.lead?.conversation?.id ??
    null;

  return {
    ...toListItem({ ...t, parent: t.parent, subtasks: t.subtasks }),
    detail: t.detail,
    createdBy: t.createdBy ? { id: t.createdBy.id, name: t.createdBy.fullName } : null,
    createdAt: t.createdAt.toISOString(),
    parent: t.parent ? { id: t.parent.id, title: t.parent.title } : null,
    // Only the front desk can open the inbox.
    conversationId: can.manageLeads(user) ? conversationId : null,
    subtasks: t.subtasks.map(toListItem),
    links: t.links.map((l) => ({ id: l.id, url: l.url, label: l.label })),
    entries: t.entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      authorId: e.author?.id ?? null,
      authorName: e.author?.fullName ?? null,
      body: e.body,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function getAssignableUsers(): Promise<AssignableUser[]> {
  await requireTaskUser();
  const users = await prisma.user.findMany({
    where: { active: true, role: { in: TASK_ROLES } },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, role: true, sede: true },
  });
  return users.map((u) => ({ id: u.id, name: u.fullName, role: u.role, sede: u.sede }));
}

/** Members (every staff role) and leads (front desk only) matching `q`. */
export async function searchTaskPeople(q: string): Promise<PersonSearchResult[]> {
  const user = await requireTaskUser();
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 3);
  if (words.length === 0 || q.trim().length < 2) return [];

  const nameMatch = (w: string) => ({
    OR: [
      { firstName: { contains: w, mode: "insensitive" as const } },
      { lastName: { contains: w, mode: "insensitive" as const } },
      { phone: { contains: w } },
    ],
  });

  const [members, leads] = await Promise.all([
    prisma.member.findMany({
      where: { AND: words.map(nameMatch) },
      select: { id: true, firstName: true, lastName: true, status: true, sede: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    can.manageLeads(user)
      ? prisma.lead.findMany({
          // A lead that already became a member is found as the member.
          where: { AND: [...words.map(nameMatch), { member: null }] },
          select: { id: true, firstName: true, lastName: true, stage: true, sede: true },
          orderBy: { updatedAt: "desc" },
          take: 6,
        })
      : Promise.resolve([]),
  ]);

  const SEDE = { FITNESS_CENTER: "Fitness", XTREME: "Xtreme" } as const;
  return [
    ...members.map((m) => ({
      kind: "member" as const,
      id: m.id,
      name: personName(m),
      detail: `Socio · ${SEDE[m.sede]}`,
    })),
    ...leads.map((l) => ({
      kind: "lead" as const,
      id: l.id,
      name: personName(l),
      detail: `Lead · ${SEDE[l.sede]}`,
    })),
  ];
}

/**
 * The Resumen card: what's due today or earlier for me — my tasks plus my
 * sede's pool — and what got closed today, struck through.
 */
export async function getTodayTasksForHome(): Promise<TaskListItem[]> {
  const user = await requireAuth();
  if (!TASK_ROLES.includes(user.role)) return [];
  const today = todayDateUtc();
  const startOfToday = ecuadorDateAt(today, 0, 0);
  const pool = poolWhere(user);
  const mineOrPool: Prisma.StaffTaskWhereInput = pool
    ? { OR: [{ assigneeId: user.id }, pool] }
    : { assigneeId: user.id };

  const rows = await prisma.staffTask.findMany({
    where: {
      AND: [
        mineOrPool,
        { dueDate: { lte: today } },
        {
          OR: [
            { status: { in: OPEN_STATUSES } },
            { status: "DONE", doneAt: { gte: startOfToday } },
          ],
        },
      ],
    },
    orderBy: listOrder,
    include: listInclude,
    take: 50,
  });
  return rows
    .map(toListItem)
    .sort((a, b) => Number(a.status === "DONE") - Number(b.status === "DONE"));
}

// ─── writes ────────────────────────────────────────────────────────────────

async function loadVisible(user: User, id: string) {
  return prisma.staffTask.findFirst({
    where: { AND: [{ id }, visibleWhere(user)] },
    include: { assignee: { select: { fullName: true } } },
  });
}

function revalidate() {
  revalidatePath("/dashboard/tareas");
  revalidatePath("/dashboard");
}

function logEvent(tx: Prisma.TransactionClient, taskId: string, userId: string, body: string) {
  return tx.staffTaskEntry.create({
    data: { taskId, authorId: userId, kind: "EVENT", body },
  });
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00Z`);
}

async function resolvePerson(
  user: User,
  person: { kind: "lead" | "member"; id: string } | null | undefined,
): Promise<{ leadId: string | null; memberId: string | null; sede: SedeValue | null } | string> {
  if (!person) return { leadId: null, memberId: null, sede: null };
  if (person.kind === "member") {
    const m = await prisma.member.findUnique({ where: { id: person.id }, select: { id: true, sede: true } });
    if (!m) return "Ese socio ya no existe.";
    return { leadId: null, memberId: m.id, sede: m.sede };
  }
  if (!can.manageLeads(user)) return "No puedes asociar leads.";
  const l = await prisma.lead.findUnique({ where: { id: person.id }, select: { id: true, sede: true } });
  if (!l) return "Ese lead ya no existe.";
  return { leadId: l.id, memberId: null, sede: l.sede };
}

async function resolveAssignee(id: string | null | undefined) {
  if (!id) return null;
  return prisma.user.findFirst({
    where: { id, active: true, role: { in: TASK_ROLES } },
    select: { id: true, fullName: true, sede: true },
  });
}

export type NewTaskInput = {
  title: string;
  detail?: string;
  type?: TaskType;
  priority?: number;
  assigneeId: string | null; // null = pool of `sede`
  sede?: SedeValue | null;
  dueDate?: string | null;
  dueTime?: string | null;
  person?: { kind: "lead" | "member"; id: string } | null;
  parentId?: string | null;
};

export async function createStaffTask(input: NewTaskInput): Promise<Result<{ id: string }>> {
  const user = await requireTaskUser();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Ponle un título." };

  let parent: { id: string; parentId: string | null; sede: SedeValue | null; leadId: string | null; memberId: string | null } | null = null;
  if (input.parentId) {
    parent = await loadVisible(user, input.parentId);
    if (!parent) return { ok: false, error: "La tarea madre ya no existe." };
    if (parent.parentId) return { ok: false, error: "Las subtareas no pueden tener subtareas." };
  }

  const assignee = await resolveAssignee(input.assigneeId);
  if (input.assigneeId && !assignee) return { ok: false, error: "Esa persona no puede recibir tareas." };
  if (!assignee && !can.manageLeads(user)) {
    return { ok: false, error: "Elige a quién se la asignas." };
  }

  // A subtask belongs to the same person as its parent unless told otherwise.
  const personInput =
    input.person === undefined && parent
      ? parent.memberId
        ? { kind: "member" as const, id: parent.memberId }
        : parent.leadId
          ? { kind: "lead" as const, id: parent.leadId }
          : null
      : input.person;
  const person = await resolvePerson(user, personInput);
  if (typeof person === "string") return { ok: false, error: person };

  // Pool tasks need a sede (null = both). Assigned ones keep one for context.
  const sede =
    input.sede !== undefined
      ? input.sede
      : (parent?.sede ?? person.sede ?? assignee?.sede ?? getSedeScope(user));

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.staffTask.create({
      data: {
        title,
        detail: input.detail?.trim() || null,
        type: input.type ?? "TASK",
        priority: Math.max(-1, Math.min(1, input.priority ?? 0)),
        assigneeId: assignee?.id ?? null,
        createdById: user.id,
        sede,
        leadId: person.leadId,
        memberId: person.memberId,
        parentId: parent?.id ?? null,
        dueDate: parseDate(input.dueDate),
        dueMinutes: parseDate(input.dueDate) ? timeToMinutes(input.dueTime) : null,
      },
    });
    const who = assignee
      ? assignee.id === user.id
        ? "se la asignó"
        : `la asignó a ${assignee.fullName}`
      : "la dejó en la recepción";
    await logEvent(tx, created.id, user.id, `Creó la tarea y ${who}.`);
    if (parent) {
      await logEvent(tx, parent.id, user.id, `Agregó la subtarea «${title}».`);
    }
    return created;
  });

  revalidate();
  return { ok: true, id: task.id };
}

export type TaskPatch = {
  title?: string;
  detail?: string | null;
  type?: TaskType;
  priority?: number;
  assigneeId?: string | null;
  sede?: SedeValue | null;
  dueDate?: string | null;
  dueTime?: string | null;
  person?: { kind: "lead" | "member"; id: string } | null;
  status?: Exclude<TaskStatus, "DONE">; // DONE goes through completeStaffTask
};

export async function updateStaffTask(id: string, patch: TaskPatch): Promise<Result> {
  const user = await requireTaskUser();
  const task = await loadVisible(user, id);
  if (!task) return { ok: false, error: "La tarea ya no existe o no es tuya." };

  const data: Prisma.StaffTaskUncheckedUpdateInput = {};
  const events: string[] = [];
  const today = ecuadorDateString();

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) return { ok: false, error: "El título no puede quedar vacío." };
    if (title !== task.title) {
      data.title = title;
      events.push(`Cambió el título a «${title}».`);
    }
  }
  if (patch.detail !== undefined) data.detail = patch.detail?.trim() || null;
  if (patch.type !== undefined && patch.type !== task.type) {
    data.type = patch.type;
    events.push(`Cambió el tipo a ${TYPE_LABEL[patch.type]}.`);
  }
  if (patch.priority !== undefined) {
    const p = Math.max(-1, Math.min(1, patch.priority));
    if (priorityLabel(p) !== priorityLabel(task.priority)) {
      data.priority = p;
      events.push(`Cambió la prioridad a ${priorityLabel(p)}.`);
    }
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId) {
    const assignee = await resolveAssignee(patch.assigneeId);
    if (patch.assigneeId && !assignee) return { ok: false, error: "Esa persona no puede recibir tareas." };
    if (!assignee && !can.manageLeads(user)) {
      return { ok: false, error: "Solo la recepción puede dejar tareas sin responsable." };
    }
    data.assigneeId = assignee?.id ?? null;
    events.push(
      assignee
        ? assignee.id === user.id
          ? "Se la asignó."
          : `La asignó a ${assignee.fullName}.`
        : "La devolvió a la recepción, sin responsable.",
    );
  }
  if (patch.sede !== undefined && patch.sede !== task.sede) data.sede = patch.sede;
  if (patch.dueDate !== undefined || patch.dueTime !== undefined) {
    const date =
      patch.dueDate !== undefined ? parseDate(patch.dueDate) : task.dueDate;
    const minutes =
      date === null
        ? null
        : patch.dueTime !== undefined
          ? timeToMinutes(patch.dueTime)
          : task.dueMinutes;
    const before = dueLabel(dateOnly(task.dueDate), task.dueMinutes, today);
    const after = dueLabel(dateOnly(date), minutes, today);
    if (before !== after) {
      data.dueDate = date;
      data.dueMinutes = minutes;
      events.push(`Cambió la fecha a ${after}.`);
    }
  }
  if (patch.person !== undefined) {
    const person = await resolvePerson(user, patch.person);
    if (typeof person === "string") return { ok: false, error: person };
    if (person.leadId !== task.leadId || person.memberId !== task.memberId) {
      data.leadId = person.leadId;
      data.memberId = person.memberId;
      events.push(patch.person ? "Cambió la persona asociada." : "Quitó la persona asociada.");
    }
  }
  if (patch.status !== undefined && patch.status !== task.status) {
    data.status = patch.status;
    if (task.status === "DONE") {
      data.doneAt = null;
      data.doneByUserId = null;
      data.outcome = null;
    }
    events.push(`Cambió el estado a ${STATUS_LABEL[patch.status]}.`);
  }

  if (Object.keys(data).length === 0) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.staffTask.update({ where: { id }, data });
    for (const e of events) await logEvent(tx, id, user.id, e);
  });
  revalidate();
  return { ok: true };
}

/**
 * Closes a task. When it's tied to a person the outcome is required ("confirmó",
 * "no contesta", "reagendó al miércoles") and also lands in their history, so
 * whoever opens the lead or the socio's file knows what happened.
 */
export async function completeStaffTask(id: string, outcome: string): Promise<Result> {
  const user = await requireTaskUser();
  const task = await loadVisible(user, id);
  if (!task) return { ok: false, error: "La tarea ya no existe o no es tuya." };
  if (task.status === "DONE") return { ok: true };

  const note = outcome.trim();
  if (!note && (task.leadId || task.memberId)) {
    return { ok: false, error: "Cuenta en una línea qué pasó." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.staffTask.update({
      where: { id },
      data: { status: "DONE", doneAt: new Date(), doneByUserId: user.id, outcome: note || null },
    });
    await logEvent(tx, id, user.id, note ? `Marcó como hecha: ${note}` : "Marcó como hecha.");
    const summary = `Tarea «${task.title}»: ${note}`;
    if (task.leadId) {
      await tx.leadInteraction.create({
        data: { leadId: task.leadId, userId: user.id, channel: "OTHER", summary },
      });
    }
    if (task.memberId) {
      await tx.memberNote.create({
        data: { memberId: task.memberId, authorId: user.id, content: summary },
      });
    }
  });

  revalidate();
  return { ok: true };
}

/** Undoes a "done" by mistake. The note in the person's history stays. */
export async function reopenStaffTask(id: string): Promise<Result> {
  const user = await requireTaskUser();
  const task = await loadVisible(user, id);
  if (!task) return { ok: false, error: "La tarea ya no existe o no es tuya." };
  if (task.status !== "DONE" && task.status !== "CANCELED") return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.staffTask.update({
      where: { id },
      data: { status: "TODO", doneAt: null, doneByUserId: null, outcome: null },
    });
    await logEvent(tx, id, user.id, "La reabrió.");
  });
  revalidate();
  return { ok: true };
}

export async function addTaskComment(id: string, body: string): Promise<Result> {
  const user = await requireTaskUser();
  const text = body.trim();
  if (!text) return { ok: false, error: "Escribe algo." };
  if (!(await loadVisible(user, id))) return { ok: false, error: "La tarea ya no existe o no es tuya." };

  await prisma.staffTaskEntry.create({
    data: { taskId: id, authorId: user.id, kind: "COMMENT", body: text },
  });
  revalidatePath("/dashboard/tareas");
  return { ok: true };
}

export async function addTaskLink(id: string, url: string, label: string): Promise<Result> {
  const user = await requireTaskUser();
  const clean = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return { ok: false, error: "Pega el enlace completo (https://…)." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Solo enlaces web (https://…)." };
  }
  if (!(await loadVisible(user, id))) return { ok: false, error: "La tarea ya no existe o no es tuya." };

  const name = label.trim() || null;
  await prisma.$transaction(async (tx) => {
    await tx.staffTaskLink.create({
      data: { taskId: id, url: parsed.toString(), label: name, addedById: user.id },
    });
    await logEvent(tx, id, user.id, `Agregó el documento «${name ?? parsed.hostname}».`);
  });
  revalidatePath("/dashboard/tareas");
  return { ok: true };
}

/** Removing a wrong link is a real delete; the feed keeps a trace of it. */
export async function removeTaskLink(linkId: string): Promise<Result> {
  const user = await requireTaskUser();
  const link = await prisma.staffTaskLink.findUnique({ where: { id: linkId } });
  if (!link || !(await loadVisible(user, link.taskId))) {
    return { ok: false, error: "Ese enlace ya no existe." };
  }
  await prisma.$transaction(async (tx) => {
    await tx.staffTaskLink.delete({ where: { id: linkId } });
    await logEvent(tx, link.taskId, user.id, `Quitó el documento «${link.label ?? link.url}».`);
  });
  revalidatePath("/dashboard/tareas");
  return { ok: true };
}
