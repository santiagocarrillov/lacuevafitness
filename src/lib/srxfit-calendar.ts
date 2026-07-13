import planData from "@/data/srxfit-plan.json";

// Plan starts Monday May 4, 2026 (Week 1, Day 1)
export const SRXFIT_START = new Date("2026-05-04T00:00:00");
export const SRXFIT_END = (() => {
  const d = new Date(SRXFIT_START);
  d.setDate(d.getDate() + 18 * 7 - 1); // last Saturday of week 18
  return d;
})();

// ─── Types ──────────────────────────────────────────────────────────

export type SrxfitSession = {
  weekNumber: number;
  block: number;
  phase: string;
  emphasis: string;
  pattern: string;
  dayName: string;
  dayType: string;
  weekSummary: string;
  breathingTechnique: string;
  coachNotes?: string;
  // raw blocks for modal rendering
  blocks: {
    activacion: unknown;
    fuerza: unknown;
    acondicionamiento: unknown;
    regulacion: unknown;
  };
};

export type CalendarCell = {
  date: string; // "YYYY-MM-DD"
  isCurrentMonth: boolean;
  isToday: boolean;
  session: SrxfitSession | null;
};

// ─── Helpers ────────────────────────────────────────────────────────

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: Date, b: Date): number {
  // Strip time component
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bb.getTime() - aa.getTime()) / 86400000);
}

// ─── Core session lookup ─────────────────────────────────────────────

export function getSessionForDate(date: Date): SrxfitSession | null {
  const jsDay = date.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  if (jsDay === 0) return null; // Sunday = rest day

  const days = daysBetween(SRXFIT_START, date);
  if (days < 0) return null;

  const weekIdx = Math.floor(days / 7); // 0-indexed week (0 = week 1)
  if (weekIdx >= 18) return null;

  // day_index in plan: 1=Mon ... 6=Sat  (matches jsDay for Mon–Sat)
  const dayIndex = jsDay;

  const weeks = (planData as { weeks: unknown[] }).weeks;
  const week = weeks[weekIdx] as Record<string, unknown>;
  if (!week) return null;

  const days2 = week.days as Array<Record<string, unknown>>;
  const day = days2.find((d) => d.day_index === dayIndex);
  if (!day) return null;

  const blocks = day.blocks as Record<string, unknown>;

  return {
    weekNumber: week.week_number as number,
    block: week.block as number,
    phase: week.phase as string,
    emphasis: week.block_emphasis as string,
    pattern: day.pattern as string,
    dayName: day.day_name as string,
    dayType: (day.day_type ?? "Equilibrado") as string,
    weekSummary: week.week_summary as string,
    breathingTechnique: week.breathing_technique as string,
    coachNotes: (day.coach_notes ?? undefined) as string | undefined,
    blocks: {
      activacion: blocks.activacion,
      fuerza: blocks.fuerza,
      acondicionamiento: blocks.acondicionamiento,
      regulacion: blocks.regulacion,
    },
  };
}

// ─── Week helpers (for the week editor) ──────────────────────────────

export function dateForWeekDay(weekNumber: number, dayIndex: number): Date {
  const d = new Date(SRXFIT_START);
  d.setDate(d.getDate() + (weekNumber - 1) * 7 + (dayIndex - 1));
  return d;
}

export type WeekDaySlot = { dayIndex: number; date: string; session: SrxfitSession | null };

// All six training days (Mon–Sat) of a plan week, resolved against the base plan.
export function getWeekSessions(weekNumber: number): WeekDaySlot[] {
  const out: WeekDaySlot[] = [];
  for (let di = 1; di <= 6; di++) {
    const date = dateForWeekDay(weekNumber, di);
    out.push({ dayIndex: di, date: isoDate(date), session: getSessionForDate(date) });
  }
  return out;
}

// ─── Monthly calendar builder ─────────────────────────────────────────

export function buildMonthCalendar(year: number, month: number): CalendarCell[][] {
  const todayStr = isoDate(new Date());
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  // Week starts Monday: Mon=0 offset, Sun=6 offset
  const firstJsDay = firstDay.getDay();
  const padStart = firstJsDay === 0 ? 6 : firstJsDay - 1;

  const cells: CalendarCell[] = [];

  // Padding from prev month
  for (let i = padStart; i > 0; i--) {
    const d = new Date(year, month - 1, 1 - i);
    const ds = isoDate(d);
    cells.push({ date: ds, isCurrentMonth: false, isToday: ds === todayStr, session: getSessionForDate(d) });
  }

  // Current month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month - 1, d);
    const ds = isoDate(date);
    cells.push({ date: ds, isCurrentMonth: true, isToday: ds === todayStr, session: getSessionForDate(date) });
  }

  // Padding from next month
  let nextD = 1;
  while (cells.length % 7 !== 0) {
    const d = new Date(year, month, nextD++);
    const ds = isoDate(d);
    cells.push({ date: ds, isCurrentMonth: false, isToday: ds === todayStr, session: getSessionForDate(d) });
  }

  // Split into weeks
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

// ─── Phase styling ───────────────────────────────────────────────────

export const PHASE_STYLES: Record<string, { pill: string; header: string }> = {
  "Aprender":      { pill: "bg-blue-100 text-blue-800 border-blue-200",    header: "bg-blue-50 border-blue-200" },
  "Desarrollar":   { pill: "bg-amber-100 text-amber-800 border-amber-200",  header: "bg-amber-50 border-amber-200" },
  "Desafiar":      { pill: "bg-rose-100 text-rose-800 border-rose-200",     header: "bg-rose-50 border-rose-200" },
  "Recuperar":     { pill: "bg-green-100 text-green-800 border-green-200",  header: "bg-green-50 border-green-200" },
  "Re-evaluación": { pill: "bg-purple-100 text-purple-800 border-purple-200", header: "bg-purple-50 border-purple-200" },
};

export function getPhaseStyle(phase: string) {
  return PHASE_STYLES[phase] ?? PHASE_STYLES["Aprender"];
}

export function getPatternLabel(pattern: string): string {
  if (pattern.includes("Full-body")) return "Full";
  if (pattern.includes("TEST")) return "TEST";
  const map: Record<string, string> = {
    Empuje: "Empuje", Unilateral: "Unil.", "Jalón": "Jalón",
    "Rotación": "Rot.", Bisagra: "Bisag.",
  };
  for (const [k, v] of Object.entries(map)) {
    if (pattern.includes(k)) return v;
  }
  return pattern.slice(0, 6);
}

// ─── Calendar navigation helpers ────────────────────────────────────

export function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

export const MONTH_NAMES_ES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
