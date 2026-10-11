# SRXFIT — Generador de rutinas

Genera semanas de programación SRXFIT que respetan el Manual Metodológico v3.0 (10-oct-2026) y el criterio revelado de Santiago, con **auto-validación**: la IA no puede entregar una semana que repita el acondicionamiento ni una que rompa las reglas de estructura del método.

## Archivos
- `system-prompt.ts` — instrucciones del método v3.0 + 12 reglas duras (criterio de overrides y Manual v3).
- `schema.ts` — Zod: forma válida de `Week` / `Session` (4 bloques). El bloque de Fuerza lleva `powerPrimer` y cada estación declara `kind`, `region` y `placement`.
- `variety-linter.ts` — Regla R1 auto-validable: rechaza formatos repetidos y movimientos sobre-usados (exime semanas de test).
- `method-linter.ts` — Reglas R7–R12: matriz de rotación (7.4), Bisagra y Jalón separados, un isométrico por sesión y dos de tren inferior por semana, dos estaciones de rotación en el día de Rotación, un intervalo largo semanal en el día Unilateral, y sinergistas después del principal en mesociclo de fuerza (regla en prueba: si se retira del manual, se quita `strength-stations`).
- `generate.ts` — orquestación: prompt → Claude (fetch) → Zod → los dos linters → reintento con feedback (máx 3).

Pruebas de los linters, sin API: `npm run test:srxfit-generador`.

## Uso
```ts
import { generateWeek } from "@/lib/srxfit-generator/generate";

const { week, attempts } = await generateWeek({
  weekNumber: 2, phase: "Desarrollar", blockEmphasis: "Hipertrofia",
  rotationKey: "1-2", isTestWeek: false,
});
```
Requiere `ANTHROPIC_API_KEY` en el entorno. Sin dependencias nuevas (usa `fetch`; Zod ya está instalado).

## Por qué existe el linter
Análisis del plan base anterior: **18/18 semanas** repetían el formato de acondicionamiento; `run`/`KB swing`/`ring row` aparecían 3–5×/semana. El linter convierte el criterio de Santiago ("no repetir acondicionamiento") en una **garantía**, no una esperanza. Validado contra el export real (`exports/srxfit-plan-with-overrides-2026-06-06.json`): marca 12 semanas no-test e exime las 6 de test.

## Qué no revisa el linter
La regla del ejercicio de test (9.4), que el primer corresponda al patrón del día y la dosis de cada estación dependen del texto libre: quedan en el prompt y en la revisión humana.

## Pendiente para producción
- Persistir las semanas generadas en Prisma/Supabase (modelo de sesiones SRXFIT ya existe).
- UI en `dashboard/srxfit` para disparar la generación y revisar antes de publicar (human-in-the-loop).
- Banco de ejercicios por patrón como datos (hoy vive en el prompt) para forzar variedad también en Fuerza.

Doc del pensamiento: vault → `Builds/SRXFIT — Generador de rutinas.md`.
