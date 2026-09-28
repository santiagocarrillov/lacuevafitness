// Shared, non-"use server" pieces of the tasks module: labels, row types and
// the date/time helpers both the server actions and the client panels use.

export type TaskStatus = "TODO" | "IN_PROGRESS" | "WAITING" | "DONE" | "CANCELED";
export type TaskType = "TASK" | "CALL" | "WHATSAPP" | "COLLECTION" | "PAPERWORK";
export type SedeValue = "FITNESS_CENTER" | "XTREME";
export type TaskView = "mine" | "assigned" | "pool" | "all";
export type TaskRepeat = "DAILY" | "WEEKDAYS" | "WEEKLY" | "MONTHLY";

export const REPEAT_LABEL: Record<TaskRepeat, string> = {
  DAILY: "Cada día",
  WEEKDAYS: "Días hábiles (L–V)",
  WEEKLY: "Cada semana",
  MONTHLY: "Cada mes",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "Por hacer",
  IN_PROGRESS: "En curso",
  WAITING: "Esperando respuesta",
  DONE: "Hecha",
  CANCELED: "Cancelada",
};

/** Tailwind classes for the status pill. */
export const STATUS_TONE: Record<TaskStatus, string> = {
  TODO: "bg-muted text-foreground",
  IN_PROGRESS: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  WAITING: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  DONE: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  CANCELED: "bg-muted text-muted-foreground line-through",
};

export const OPEN_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "WAITING"];

export const TYPE_LABEL: Record<TaskType, string> = {
  TASK: "Tarea",
  CALL: "Llamada",
  WHATSAPP: "WhatsApp",
  COLLECTION: "Cobro",
  PAPERWORK: "Trámite",
};

export const SEDE_LABEL: Record<SedeValue, string> = {
  FITNESS_CENTER: "Fitness",
  XTREME: "Xtreme",
};

export const VIEW_LABEL: Record<TaskView, string> = {
  mine: "Mis tareas",
  assigned: "Asignadas por mí",
  pool: "Recepción",
  all: "Todas",
};

export function priorityLabel(p: number): "Alta" | "Normal" | "Baja" {
  return p > 0 ? "Alta" : p < 0 ? "Baja" : "Normal";
}

export type PersonRef = {
  kind: "lead" | "member";
  id: string;
  name: string;
};

export type TaskUser = { id: string; name: string };

export type TaskListItem = {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  priority: number;
  sede: SedeValue | null;
  dueDate: string | null; // YYYY-MM-DD (Ecuador day)
  dueMinutes: number | null;
  assignee: TaskUser | null;
  person: PersonRef | null;
  parentTitle: string | null;
  subtaskCount: number;
  subtaskDone: number;
  doneAt: string | null;
  doneByName: string | null;
  outcome: string | null;
  repeat: TaskRepeat | null;
};

export type TaskEntry = {
  id: string;
  kind: "COMMENT" | "EVENT";
  authorName: string | null;
  authorId: string | null;
  body: string;
  createdAt: string;
};

export type TaskDetail = TaskListItem & {
  detail: string | null;
  isAuto: boolean;
  watchers: TaskUser[];
  createdBy: TaskUser | null;
  createdAt: string;
  parent: { id: string; title: string } | null;
  conversationId: string | null;
  subtasks: TaskListItem[];
  links: { id: string; url: string; label: string | null }[];
  entries: TaskEntry[];
};

export type AssignableUser = {
  id: string;
  name: string;
  role: string;
  sede: SedeValue | null;
};

export type PersonSearchResult = PersonRef & { detail: string };

/** "17:00" for 1020; "" for null. */
export function minutesToTime(m: number | null): string {
  if (m === null) return "";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 1020 for "17:00"; null for "" or garbage. */
export function timeToMinutes(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const WEEKDAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Human due label relative to `today` (both YYYY-MM-DD): "Hoy 17:00",
 * "Mañana", "Ayer", "vie 3 oct".
 */
export function dueLabel(date: string | null, minutes: number | null, today: string): string {
  if (!date) return "Sin fecha";
  const d = new Date(`${date}T00:00:00Z`);
  const t = new Date(`${today}T00:00:00Z`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  const day =
    diff === 0
      ? "Hoy"
      : diff === 1
        ? "Mañana"
        : diff === -1
          ? "Ayer"
          : `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
  return minutes === null ? day : `${day} ${minutesToTime(minutes)}`;
}

export type DueBucket = "overdue" | "today" | "upcoming" | "undated";

export function dueBucket(date: string | null, today: string): DueBucket {
  if (!date) return "undated";
  if (date < today) return "overdue";
  if (date === today) return "today";
  return "upcoming";
}

export function isDriveUrl(url: string): boolean {
  return /^https:\/\/(drive|docs)\.google\.com\//i.test(url);
}

export type PostponePreset = "hour" | "tomorrow" | "week";

export const POSTPONE_LABEL: Record<PostponePreset, string> = {
  hour: "1 hora",
  tomorrow: "Mañana",
  week: "Próxima semana",
};

/** What focus mode shows about the person next to the task. */
export type PersonSummary = PersonRef & {
  href: string;
  phone: string | null;
  sede: SedeValue;
  status: string; // "Activo", "Agendado"…
  facts: string[]; // "Mensual · vence 12 oct", "Última asistencia: hace 3 días"
  recent: { when: string; text: string; author: string | null }[];
};

export type FocusQueueItem = { id: string; title: string };

/**
 * wa.me wants international digits. Ecuadorian numbers are often stored as
 * 09XXXXXXXX; those become 5939XXXXXXXX. null if there's nothing usable.
 */
export function whatsappDigits(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("0")) d = `593${d.slice(1)}`;
  if (d.length === 9 && d.startsWith("9")) d = `593${d}`;
  return d.length >= 10 ? d : null;
}

/**
 * The day after `from` (YYYY-MM-DD, UTC-midnight semantics) on which a
 * repeating task falls next, never earlier than `notBefore`.
 */
export function nextRepeatDate(repeat: TaskRepeat, from: string, notBefore: string): string {
  const step = (d: Date): Date => {
    const n = new Date(d);
    switch (repeat) {
      case "DAILY":
        n.setUTCDate(n.getUTCDate() + 1);
        return n;
      case "WEEKDAYS":
        do n.setUTCDate(n.getUTCDate() + 1);
        while (n.getUTCDay() === 0 || n.getUTCDay() === 6);
        return n;
      case "WEEKLY":
        n.setUTCDate(n.getUTCDate() + 7);
        return n;
      case "MONTHLY": {
        // Day 31 in a 30-day month lands on the 30th, not on the 1st.
        const day = new Date(`${from}T00:00:00Z`).getUTCDate();
        const target = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1));
        const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
        target.setUTCDate(Math.min(day, last));
        return target;
      }
    }
  };
  let d = step(new Date(`${from}T00:00:00Z`));
  const floor = new Date(`${notBefore}T00:00:00Z`);
  while (d < floor) d = step(d);
  return d.toISOString().slice(0, 10);
}
