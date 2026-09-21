/**
 * Quién cuenta como "socio activo" — y quién no.
 *
 * Desde que el registro de una evaluación da de alta al socio (status TRIAL), la
 * distinción dejó de ser teórica: cada evaluación de $9 crea un Member. Santiago
 * decidió (21 sep 2026) que un socio en evaluación **no** cuenta como activo
 * hasta que paga su mensualidad; vive en el embudo y en su propio contador.
 *
 * Por eso hay dos bases y no una:
 *
 *  - ACTIVE_BASE   → reportes, KPIs y facturación. Solo quien paga.
 *  - TRAINING_BASE → quién entrena hoy: asistencia, rutinas SRXFit, check-ins.
 *                    Incluye a los de evaluación, que sí están en el gimnasio.
 *
 * Si vas a escribir `status: { in: ["ACTIVE", "TRIAL"] }`, usa una de estas dos y
 * deja claro de qué pregunta estás hablando.
 */

import { MemberStatus } from "@/generated/prisma/client";

/** Base de socios activos: reportes, KPIs, facturación. */
export const ACTIVE_BASE = [MemberStatus.ACTIVE];

/** Base de gente que entrena: asistencia, rutinas, notificaciones. */
export const TRAINING_BASE = [MemberStatus.ACTIVE, MemberStatus.TRIAL];
