/**
 * SRXFIT — Schema de validación (Zod v4) para una semana generada.
 * Garantiza que la salida del modelo tenga la forma correcta antes de aceptarla.
 */
import { z } from "zod";

export const PATTERNS = ["Empuje", "Unilateral", "Jalón", "Rotación", "Bisagra", "Full-body"] as const;
export const PHASES = ["Aprender", "Desarrollar", "Desafiar", "Recuperar", "Reevaluación"] as const;
export const COND_FORMATS = ["AMRAP", "EMOM", "RFT", "Tabata", "Intervalos", "Parejas", "Estaciones", "Z2"] as const;
export const ZONES = ["Z2", "Z3", "Z4"] as const;
export const DAY_TYPES = ["Fuerza pesada", "Equilibrado", "Metabólico"] as const;

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
  mainExercise: z.string(),
  scheme: z.string(), // ej. "4 × 10 · RPE 7 · descanso 75s"
  scaling,
  stations: z.array(z.object({ name: z.string(), reps: z.string(), target: z.string() })),
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
  weekNumber: z.number().int().min(1).max(18),
  block: z.number().int().min(1).max(2),
  blockEmphasis: z.string(),
  phase: z.enum(PHASES),
  breathingTechnique: z.string(),
  rotationKey: z.string(),
  isTestWeek: z.boolean(), // true en Desafiar y Reevaluación (excepción de variedad, R1)
  sessions: z.array(sessionSchema).min(5).max(6),
});

export type Week = z.infer<typeof weekSchema>;
export type Session = z.infer<typeof sessionSchema>;
