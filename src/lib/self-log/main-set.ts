// The best set of the day's main lift (Manual SRXFIT v3, 9.5). Pure helpers:
// the portal form, the validation queue and scripts/test-serie-principal.ts
// all use them.

import type { Check } from "./plausibility";

export const MAIN_SET_LIMITS = { loadKg: [1, 500], reps: [1, 30], rir: [0, 6] } as const;

/** Biggest jump of the estimated 1RM over the best official one that still reads as normal. */
const MAX_E1RM_JUMP = 0.12;
/** Above this multiple of body weight the load is amber whatever the history says. */
const MAX_LOAD_X_BODYWEIGHT = 3;

export type MainSet = { loadKg: number; reps: number; rir: number };

/**
 * Estimated 1RM (Epley) counting the reps left in reserve as reps the socio
 * could have done. It carries error: read the trend of three or more
 * sessions, never a single value.
 */
export function estimate1Rm({ loadKg, reps, rir }: MainSet): number {
  const toFailure = reps + rir;
  const e = toFailure <= 1 ? loadKg : loadKg * (1 + toFailure / 30);
  return Math.round(e * 10) / 10;
}

/** Same lift whatever the casing or spacing the socio typed. */
export function exerciseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function formatMainSet(s: MainSet): string {
  return `${s.loadKg} kg × ${s.reps} · ${s.rir} en reserva`;
}

/** The main lift as written in the day's strength block ("**Ejercicio principal:** …"). */
export function mainExerciseFromMd(fuerzaMd: string): string | null {
  const m = fuerzaMd.match(/\*\*Ejercicio principal:\*\*\s*(.+)/);
  return m ? m[1].trim() : null;
}

export function validateMainSet(input: { exercise: string; loadKg: number | null; reps: number | null; rir: number | null }):
  | { ok: true; set: MainSet }
  | { ok: false; error: string } {
  const { exercise, loadKg, reps, rir } = input;
  const L = MAIN_SET_LIMITS;
  if (exercise.trim().length < 2 || exercise.length > 80) return { ok: false, error: "Escribe el ejercicio principal." };
  if (loadKg == null || loadKg < L.loadKg[0] || loadKg > L.loadKg[1]) return { ok: false, error: `La carga debe estar entre ${L.loadKg[0]} y ${L.loadKg[1]} kg.` };
  if (reps == null || !Number.isInteger(reps) || reps < L.reps[0] || reps > L.reps[1]) return { ok: false, error: `Las repeticiones van de ${L.reps[0]} a ${L.reps[1]}.` };
  if (rir == null || !Number.isInteger(rir) || rir < L.rir[0] || rir > L.rir[1]) return { ok: false, error: `Las repeticiones en reserva van de ${L.rir[0]} a ${L.rir[1]}.` };
  return { ok: true, set: { loadKg, reps, rir } };
}

/**
 * "Verde o revisar" for a logged set, against the socio's best OFFICIAL
 * estimated 1RM in that same lift (null = none yet).
 */
export function checkMainSet(input: MainSet & { previousBestE1Rm: number | null; bodyWeightKg: number | null }): Check {
  const { previousBestE1Rm, bodyWeightKg } = input;
  if (bodyWeightKg && input.loadKg > bodyWeightKg * MAX_LOAD_X_BODYWEIGHT) {
    return { green: false, note: `${Math.round((input.loadKg / bodyWeightKg) * 10) / 10}× su peso corporal` };
  }
  if (previousBestE1Rm == null || previousBestE1Rm <= 0) {
    return { green: false, note: "Sin registro oficial anterior de este ejercicio" };
  }
  const e1rm = estimate1Rm(input);
  const delta = Math.round((e1rm - previousBestE1Rm) * 10) / 10;
  if (delta <= 0) {
    return { green: true, note: delta === 0 ? "Igual a su mejor 1RM estimado" : `${-delta} kg bajo su mejor 1RM estimado` };
  }
  const pct = Math.round((delta / previousBestE1Rm) * 1000) / 10;
  const label = `+${delta} kg de 1RM estimado (+${pct} %)`;
  return delta > previousBestE1Rm * MAX_E1RM_JUMP ? { green: false, note: `Salto grande: ${label}` } : { green: true, note: label };
}
