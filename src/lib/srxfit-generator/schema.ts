/**
 * SRXFIT — Schema de validación (Zod v4) para una semana generada.
 * Garantiza que la salida del modelo tenga la forma correcta antes de aceptarla.
 */
import { z } from "zod";

export const PATTERNS = ["Empuje", "Unilateral", "Jalón", "Rotación", "Bisagra", "Full-body"] as const;
export const PHASES = ["Aprender", "Desarrollar", "Desafiar", "Recuperar", "Reevaluación"] as const;
export const COND_FORMATS = ["AMRAP", "EMOM", "RFT", "Tabata", "Intervalos", "Parejas", "Estaciones", "Z2"] as const;
export const ROTATION_KEYS = ["1-2", "3-4", "5-6", "7-8", "9"] as const;
export const ZONES = ["Z2", "Z3", "Z4"] as const;
export const DAY_TYPES = ["Fuerza pesada", "Equilibrado", "Metabólico"] as const;
export const STATION_KINDS = ["sinergista", "neutro", "isométrico", "rotación"] as const;
export const STATION_REGIONS = ["inferior", "superior", "core"] as const;
export const STATION_PLACEMENTS = ["entre series", "después del principal"] as const;

const scaling = z.object({ n1: z.string(), n2: z.string(), n3: z.string() });

export const activacionSchema = z.object({
  durationMin: z.number().int().min(8).max(12),
  movilidad: z.array(z.string()).min(1),
  rounds: z.string(),
  cardio: z.string(),
  rules: z.array(z.string()),
});

export const fuerzaSchema = z.object({
  durationMin: z.number().int().min(20).max(30),
  // Manual v3, 7.2: dosis fija de potencia, antes del principal.
  powerPrimer: z.object({
    exercise: z.string().min(1),
    dose: z.string().min(1), // ej. "4 × 3, descanso completo"
    lowImpact: z.string().min(1),
  }),
  mainExercise: z.string(),
  scheme: z.string(), // ej. "4 × 10 · RPE 7 · descanso 75s"
  scaling,
  stations: z.array(
    z.object({
      name: z.string(),
      reps: z.string(),
      target: z.string(),
      kind: z.enum(STATION_KINDS),
      region: z.enum(STATION_REGIONS),
      placement: z.enum(STATION_PLACEMENTS),
    }),
  ),
  coachNote: z.string().min(1), // R6: porqué + cue
});

export const acondicionamientoSchema = z.object({
  durationMin: z.number().int().min(3).max(15),
  format: z.enum(COND_FORMATS),
  zone: z.enum(ZONES),
  description: z.string(),
  movements: z.array(z.string()).min(1), // usado por el linter de variedad
  scaling,
});

export const regulacionSchema = z.object({
  durationMin: z.number().int().min(3).max(5),
  mobility: z.array(z.string()).min(1),
  breathing: z.string(), // R7: exhalación 1:2 en año 1
  closing: z.string().min(1), // R6: frase de cierre ligada al patrón
});

export const sessionSchema = z.object({
  dayIndex: z.number().int().min(1).max(6),
  dayName: z.string(),
  pattern: z.enum(PATTERNS),
  dayType: z.enum(DAY_TYPES),
  activacion: activacionSchema,
  fuerza: fuerzaSchema,
  acondicionamiento: acondicionamientoSchema,
  regulacion: regulacionSchema,
});

export const weekSchema = z.object({
  weekNumber: z.number().int().min(1), // corre de bloque en bloque (el Bloque 3 es 19–27)
  block: z.number().int().min(1).max(2),
  blockEmphasis: z.string(),
  phase: z.enum(PHASES),
  breathingTechnique: z.string(),
  rotationKey: z.enum(ROTATION_KEYS),
  isTestWeek: z.boolean(), // true en Desafiar y Reevaluación (excepción de variedad, R1)
  sessions: z.array(sessionSchema).min(5).max(6),
});

export type Week = z.infer<typeof weekSchema>;
export type Session = z.infer<typeof sessionSchema>;
