@AGENTS.md

# La Cueva — Dashboard SRXFit

Dashboard operativo de La Cueva Fitness Center y La Cueva Xtreme. Reemplaza Google Sheets + HubSpot Free + WhatsApp + QuickBooks manual. A mediano plazo aloja la metodología SRXFit (evaluación → prescripción → ejecución → seguimiento → re-evaluación cada 9 semanas).

Plan estratégico completo: `/Users/santiagocarrillo/.claude/plans/vectorized-twirling-dusk.md`. **No duplicar aquí — solo referenciarlo.**

---

## Stack (versiones críticas — no asumir APIs)

- **Next.js 16.2.3** + **React 19.2.4** ⚠️ Ver AGENTS.md — APIs cambiaron, leer `node_modules/next/dist/docs/` antes de escribir código.
- **Prisma 7.7.0** con `@prisma/adapter-pg` (no el cliente clásico). Cliente generado en `src/generated/prisma/`, NO en `@prisma/client`.
- **Supabase SSR** (`@supabase/ssr` 0.10.2) — Auth + Postgres + Storage.
- **Tailwind 4** + **shadcn/ui** (componentes en `src/components/ui/`).
- **Recharts**, **react-hook-form**, **zod**, **sonner**.
- **NO instalado** (decisión: aplazar): Stripe, QuickBooks SDK, Resend, Twilio.

---

## Estado actual (Abr 2026)

### ✅ Funcional — no tocar salvo bug

- Auth + roles + scoping por sede (`src/lib/auth.ts`, `src/lib/actions/auth.ts`)
- Dashboard home con KPIs en vivo (`src/app/dashboard/page.tsx`)
- Asistencia — admin panel + coach panel + antifraude (`src/app/dashboard/asistencia/`) ← módulo más maduro, usar como template
- Socios (CRM)
- Leads (pipeline de ventas)
- Reportes
- Usuarios
- Importación HubSpot (`scripts/import-hubspot.ts`, comando `npm run import:hubspot`)

### 🟡 En construcción (orden de prioridad)

1. **Pagos** ← retomar aquí. Ver sección "Decisión Pagos" abajo.
2. **SRXFit** — registrar baterías de tests + mostrar programaciones a coaches.
3. **Retos** — gamificación.
4. **Segmentos** — segmentación de socios.

### ⏳ Postergado

- Stripe integration
- QuickBooks Online conciliación automática
- App móvil de miembro (Fase 3)

---

## Decisiones críticas (no obvias del código)

### Schema
- Cubre Fases 1–3 sin migraciones disruptivas. **No expandir el schema sin discutir** — ya está sobre-diseñado a propósito.
- IDs: `cuid()` en todos los modelos.
- Soft delete via `active: Boolean` — **nunca DELETE**.
- Antifraude asistencia: `ClassSession.adminCount` vs `coachCount`, flag `discrepancy: Boolean`.

### Decisión Pagos (Abr 2026 — vigente)

**No conectar Stripe ni QuickBooks por ahora.** Isabel registra pagos manualmente desde lo que ve en banco/Stripe externo.

**Flujo:**
1. Isabel ingresa los pagos que ve en banco/Stripe en un formato tipo hoja de cálculo (copy-paste friendly).
2. Estados de pago según método:
   - **Efectivo** → admin lo registra al momento, queda asignado de inmediato.
   - **Transferencia / TC sin verificar** → entra como **"fondos sin depositar"**, no asignado a nadie.
   - **Transferencia / TC verificado por Isabel** → queda disponible para asignar.
3. Cuando admin cobra membresía a un socio: si es efectivo → registro directo. Si no → selecciona de la lista de pagos pre-cargados disponibles.

**Campos mínimos del registro de pago (lo que Isabel ingresa):**
fecha, nombre del socio (opcional), nombre de quien depositó/transfirió/tarjeta, número de referencia de transacción, entidad bancaria, cantidad.

Los admins ven los mismos campos al registrar un pago.

### Roles (enum `UserRole`)
- `OWNER` (Santiago) — vista completa, ambas sedes.
- `ACCOUNTING` (Isabel) — pagos, conciliación, caja.
- `ADMIN` — su sede únicamente.
- `COACH` — confirma conteo al cierre de clase.
- `NUTRITIONIST` — composición corporal, planes nutricionales.
- `MEMBER` — app móvil (Fase 3, no aún).

### Sedes (enum `Sede`)
- `FITNESS_CENTER` (CrossFit)
- `XTREME` (funcional)

---

## Convenciones de código

- **Server actions** → `src/lib/actions/[feature].ts`
- **Componentes UI** → `src/components/ui/` (shadcn) — extender, no reemplazar.
- **Cliente Prisma** → import desde `@/lib/prisma` (singleton con adapter-pg). **No `@prisma/client`.**
- **Auth helpers** → `requireAuth()`, `can.*(user)`, `getSedeScope(user)` desde `@/lib/auth`.
- **Páginas con datos en vivo** → `export const dynamic = "force-dynamic"`.
- **Idioma**: UI en español, código y comentarios en inglés.

---

## Índice de archivos (qué leer según la tarea)

| Tarea | Leer primero |
|---|---|
| Cualquier feature nueva | `prisma/schema.prisma` + `src/lib/auth.ts` |
| Pagos | Sección "Decisión Pagos" arriba + `prisma/schema.prisma` (modelos Payment, Membership, MembershipPlan) |
| SRXFit | `prisma/schema.prisma` (Evaluation, TestResult, BodyComposition, TrainingLevelAssignment) + el `build_plan.py` standalone como referencia metodológica |
| Asistencia (template) | `src/app/dashboard/asistencia/*` — patrón a replicar |
| Reportes | `prisma/schema.prisma` (DailyIndicators, MonthlyTarget, Expense) + recharts |
| Auth / permisos | `src/lib/auth.ts` |

---

## Dónde retomar (actualizar al cerrar cada sesión)

**Última sesión:** Diseño del módulo de Pagos según "Decisión Pagos" arriba.

**Próximo paso concreto:**
- Construir el formulario de Isabel para registrar pagos (estilo hoja de cálculo).
- Construir el panel de admin para asignar pagos pre-cargados a membresías.
- Schema actual (`Payment`, `PaymentMethod`, `PaymentStatus`) ya cubre el caso — verificar antes de migrar.

**Después de pagos:** SRXFit (registrar baterías de tests + visualización de programaciones para coaches).

---

## Reglas para Claude Code en este repo

1. **Antes de escribir código que use APIs de Next 16, Prisma 7 o React 19** → leer la doc local en `node_modules/`. No asumir APIs de versiones anteriores.
2. **Antes de proponer integraciones** (Stripe, QBO, etc.) → revisar sección "Postergado". Si está ahí, no implementar; preguntar primero.
3. **Antes de modificar el schema** → discutir. Está diseñado holísticamente, modificar sin pensar rompe Fases 2-3.
4. **Para módulos nuevos** → seguir el patrón de `asistencia/` (server actions en `lib/actions/`, panels separados, tipos derivados de Prisma).
5. **Si la sesión se está alargando** → proponer un commit + `/clear` antes de saturar contexto.
