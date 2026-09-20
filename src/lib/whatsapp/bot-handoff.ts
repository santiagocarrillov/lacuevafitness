/**
 * Scheduled hand-back from a human to the bot.
 *
 * Taking over a conversation is easy to remember; giving it back is not. A lead
 * that an admin answered on Friday afternoon sat unanswered all weekend, because
 * `botPaused` stays true until someone clicks. So the pause can now carry an
 * expiry: "devuélvemela al bot el lunes a las 8".
 *
 * Plain module (no "use server"): the presets are shared by the server actions,
 * the agent runner and the inbox UI.
 */

import { ecuadorDateAt, ecuadorParts, todayDateUtc } from "@/lib/timezone";

export type ResumePreset = "now" | "in_1h" | "in_4h" | "tomorrow_8" | "monday_8";

export const RESUME_PRESETS: Array<{ value: ResumePreset; label: string }> = [
  { value: "now", label: "Ahora mismo" },
  { value: "in_1h", label: "En 1 hora" },
  { value: "in_4h", label: "En 4 horas" },
  { value: "tomorrow_8", label: "Mañana 8:00 am" },
  { value: "monday_8", label: "El lunes 8:00 am" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_INDEX: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

/**
 * When the bot should take the conversation back. `null` means immediately.
 * Ecuador has no DST, so day arithmetic on UTC-midnight dates is exact.
 */
export function resolveResumeAt(preset: ResumePreset, now: Date = new Date()): Date | null {
  switch (preset) {
    case "now":
      return null;
    case "in_1h":
      return new Date(now.getTime() + 60 * 60 * 1000);
    case "in_4h":
      return new Date(now.getTime() + 4 * 60 * 60 * 1000);
    case "tomorrow_8":
      return ecuadorDateAt(new Date(todayDateUtc().getTime() + DAY_MS), 8, 0);
    case "monday_8": {
      const today = WEEKDAY_INDEX[ecuadorParts(now).weekday];
      // Always the NEXT Monday: clicking this on a Monday means "in a week" is
      // wrong, but "today at 8am" is already past — so we jump to tomorrow+.
      const daysAhead = ((1 - today + 7) % 7) || 7;
      return ecuadorDateAt(new Date(todayDateUtc().getTime() + daysAhead * DAY_MS), 8, 0);
    }
  }
}

/** Short Ecuador-local label for a scheduled hand-back, e.g. "lun 8:00 a. m.". */
export function formatResumeAt(iso: string): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function isResumePreset(v: string): v is ResumePreset {
  return RESUME_PRESETS.some((p) => p.value === v);
}
