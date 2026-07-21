// Menstrual cycle phase estimation from registered period start dates.
// Educational/training guidance only — not medical advice.

export type CyclePhase = "MENSTRUAL" | "FOLICULAR" | "OVULACION" | "LUTEA";

export type CycleState =
  | { known: false } // no periods registered yet
  | {
      known: true;
      cycleDay: number;
      cycleLength: number;
      periodLength: number;
      phase: CyclePhase;
      overdue: boolean; // cycleDay well past the expected length
      lastStartISO: string;
      predictedNextISO: string;
    };

export const PHASE_META: Record<
  CyclePhase,
  { label: string; color: string; training: string }
> = {
  MENSTRUAL: {
    label: "Menstrual",
    color: "#ef4444",
    training:
      "Energía más baja. Prioriza movilidad, cardio ligero y fuerza suave. Escucha a tu cuerpo y descansa lo necesario.",
  },
  FOLICULAR: {
    label: "Folicular",
    color: "#22c55e",
    training:
      "La energía sube. Buen momento para entrenar fuerza e intensidad y progresar cargas.",
  },
  OVULACION: {
    label: "Ovulación",
    color: "#f59e0b",
    training:
      "Pico de energía y fuerza — ideal para tus mejores marcas. Cuida la técnica: hay más laxitud articular.",
  },
  LUTEA: {
    label: "Lútea",
    color: "#8b5cf6",
    training:
      "La energía baja de a poco. Mantén volumen moderado y prioriza recuperación, sueño e hidratación.",
  },
};

// All dates here are @db.Date values stored at UTC midnight (and "today" is
// passed the same way), so compare in UTC to avoid off-by-one in negative
// timezones like Ecuador (UTC-5).
function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((utcMidnight(b) - utcMidnight(a)) / 86400000);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type PeriodInput = { startDate: Date; endDate: Date | null };

// periods: newest first.
export function computeCycleState(periods: PeriodInput[], today: Date): CycleState {
  if (periods.length === 0) return { known: false };

  const sorted = [...periods].sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  const lastStart = sorted[0].startDate;

  // Average gap between consecutive starts (up to the 6 most recent), else 28.
  let cycleLength = 28;
  const gaps: number[] = [];
  for (let i = 0; i < Math.min(sorted.length - 1, 6); i++) {
    const g = daysBetween(sorted[i + 1].startDate, sorted[i].startDate);
    if (g >= 15 && g <= 45) gaps.push(g);
  }
  if (gaps.length > 0) {
    cycleLength = clamp(Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length), 21, 35);
  }

  // Period length from the most recent period that has an endDate, else 5.
  let periodLength = 5;
  const withEnd = sorted.find((p) => p.endDate);
  if (withEnd?.endDate) {
    periodLength = clamp(daysBetween(withEnd.startDate, withEnd.endDate) + 1, 2, 10);
  }

  const cycleDay = daysBetween(lastStart, today) + 1; // day 1 = start day
  const overdue = cycleDay > cycleLength + 5;

  const ovulationDay = cycleLength - 14;
  let phase: CyclePhase;
  if (cycleDay <= periodLength) phase = "MENSTRUAL";
  else if (cycleDay < ovulationDay - 1) phase = "FOLICULAR";
  else if (cycleDay <= ovulationDay + 1) phase = "OVULACION";
  else phase = "LUTEA";

  const predictedNext = new Date(
    Date.UTC(lastStart.getUTCFullYear(), lastStart.getUTCMonth(), lastStart.getUTCDate() + cycleLength),
  );

  return {
    known: true,
    cycleDay,
    cycleLength,
    periodLength,
    phase,
    overdue,
    lastStartISO: isoDate(lastStart),
    predictedNextISO: isoDate(predictedNext),
  };
}
