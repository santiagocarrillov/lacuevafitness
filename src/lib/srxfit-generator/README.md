# SRXFIT — Generador de rutinas

Genera semanas de programación SRXFIT que respetan el método v1.0 y el criterio revelado de Santiago, con **auto-validación de variedad** (la IA no puede entregar una semana que repita el acondicionamiento).

## Archivos
- `system-prompt.ts` — instrucciones del método v1.0 + 7 reglas duras (criterio de overrides).
- `schema.ts` — Zod: forma válida de `Week` / `Session` (4 bloques).
- `variety-linter.ts` — Regla R1 auto-validable: rechaza formatos repetidos y movimientos sobre-usados (exime semanas de test).
- `generate.ts` — orquestación: prompt → Claude (fetch) → Zod → linter → reintento con feedback (máx 3).

## Uso
```ts
import { generateWeek } from "@/lib/srxfit-generator/generate";

const { week, attempts } = await generateWeek({
  weekNumber: 2, phase: "Desarrollar", blockEmphasis: "Hipertrofia",
  rotationKey: "1-2", isTestWeek: false, sede: "Fitness Center",
});
```
Requiere `ANTHROPIC_API_KEY` en el entorno. Sin dependencias nuevas (usa `fetch`; Zod ya está instalado).

## Por qué existe el linter
Análisis del plan base anterior: **18/18 semanas** repetían el formato de acondicionamiento; `run`/`KB swing`/`ring row` aparecían 3–5×/semana. El linter convierte el criterio de Santiago ("no repetir acondicionamiento") en una **garantía**, no una esperanza. Validado contra el export real (`exports/srxfit-plan-with-overrides-2026-06-06.json`): marca 12 semanas no-test e exime las 6 de test.

## Pendiente para producción
- Persistir las semanas generadas en Prisma/Supabase (modelo de sesiones SRXFIT ya existe).
- UI en `dashboard/srxfit` para disparar la generación y revisar antes de publicar (human-in-the-loop).
- Banco de ejercicios por patrón como datos (hoy vive en el prompt) para forzar variedad también en Fuerza.

Doc del pensamiento: vault → `Builds/SRXFIT — Generador de rutinas.md`.
