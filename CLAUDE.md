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
- **Resend** — email transaccional. Instalado jul 2026 para el aviso del formulario web
  (`src/lib/leads/notify.ts`). Requiere `RESEND_API_KEY`; el remitente debe estar en un dominio
  verificado en Resend (`LEAD_NOTIFY_FROM`, destino `LEAD_NOTIFY_TO`).
- **NO instalado** (decisión: aplazar): Stripe, QuickBooks SDK, Twilio.

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
- `FITNESS_CENTER` — casa original (techado, mezzanine, fuerza).
- `XTREME` — nave abovedada abierta.

> ⚠️ **Desde el Bloque 3 (sep 2026) las dos sedes miden bench press Y push press.**
> El criterio viejo (Fitness = bench, Xtreme = push press) queda obsoleto: la serie
> histórica ahora es comparable entre sedes. Xtreme necesita bancos para el martes
> de la semana de re-evaluación.

> ⚠️ **Las DOS sedes entrenan SRXFIT** (el mismo método). Los rótulos viejos
> "Fitness Center = CrossFit" / "Xtreme = funcional" están **OBSOLETOS** — se
> diferencian por espacio/ubicación, no por método. No usar CrossFit/funcional en UI ni copy.

---

## Convenciones de código

- **Server actions** → `src/lib/actions/[feature].ts`
- **Componentes UI** → `src/components/ui/` (shadcn) — extender, no reemplazar.
- **Cliente Prisma** → import desde `@/lib/prisma` (singleton con adapter-pg). **No `@prisma/client`.**
- **Auth helpers** → `requireAuth()`, `can.*(user)`, `getSedeScope(user)` desde `@/lib/auth`.
- **Páginas con datos en vivo** → `export const dynamic = "force-dynamic"`.
- **Idioma**: UI en español, código y comentarios en inglés.
- **Interfaz (Santiago, 2 oct 2026)**: (1) toda cifra o fila lleva a su detalle (estados → mayor → documento;
  ver `contabilidad/links.ts` y `/dashboard/finanzas/origen`); (2) hay botón **Atrás** global
  (`dashboard/back-button.tsx`); (3) los formularios de captura son **pantallas** con su ruta (`/nuevo`,
  `/[id]`, contenedor `(finanzas)/form-page.tsx`), no ventanas emergentes — solo confirmaciones cortas en
  diálogo; (4) Finanzas, Facturación, Gastos y Contabilidad viven en el grupo de rutas
  `src/app/dashboard/(finanzas)/` bajo **un solo menú**, organizado en módulos estilo QuickBooks (Inicio · Clientes ·
  Proveedores · Trabajadores · Caja y Bancos · Empresa · Reportes) definidos en `(finanzas)/modules.ts`; fondo blanco.
  Visión de producto y fases: `docs/contabilidad-v2.md`.
- **Ficha única por persona (3 oct 2026)**: lead y socio usan la misma ficha estilo HubSpot de 3 columnas
  (`src/components/ficha/`): identidad + acciones rápidas | resumen + pestañas + línea de tiempo unificada
  (`src/lib/ficha/timeline.ts`, todo con su enlace) | lo asociado. `/dashboard/leads/[id]` redirige a la
  ficha del socio si ya lo es. El menú lateral va agrupado por flujo de trabajo y se esconde con un click o `[`.

---

## Índice de archivos (qué leer según la tarea)

| Tarea | Leer primero |
|---|---|
| Cualquier feature nueva | `prisma/schema.prisma` + `src/lib/auth.ts` |
| Pagos | Sección "Decisión Pagos" arriba + `prisma/schema.prisma` (modelos Payment, Membership, MembershipPlan) |
| SRXFit | `prisma/schema.prisma` (Evaluation, TestResult, BodyComposition, TrainingLevelAssignment) + el `build_plan.py` standalone como referencia metodológica |
| Asistencia (template) | `src/app/dashboard/asistencia/*` — patrón a replicar |
| Reportes | `prisma/schema.prisma` (DailyIndicators, MonthlyTarget) + recharts |
| Finanzas (gestión: banco, SRI, gastos) | `docs/finanzas-fase1.md` + `src/lib/finance/` + `src/lib/actions/finance.ts` |
| Gastos con líneas + lectura del comprobante por IA (admins sin ver nómina) | `docs/gastos-modulo3.md` + `src/lib/expenses/` + `src/lib/actions/expenses.ts` |
| Impuestos: borrador del 104 (IVA) y ATS de Xtreme | `docs/impuestos.md` + `src/lib/taxes/` |
| Facturación electrónica (emisión directa al SRI) | `docs/facturacion-sri.md` + `src/lib/invoicing/` + `src/lib/actions/invoicing.ts` |
| Contabilidad: módulos, portada y plan multiempresa | `docs/contabilidad-v2.md` + `src/app/dashboard/(finanzas)/modules.ts` |
| Contabilidad (libro diario, reemplaza QuickBooks) | `docs/contabilidad-libro-diario.md` + `src/lib/accounting/` — los reportes leen SOLO del libro diario |
| Auth / permisos | `src/lib/auth.ts` |

---

## Dónde retomar (actualizar al cerrar cada sesión)

**Última sesión (4 oct 2026, tarde):** PRs #132–#138 en producción (main `b84180f`). Migraciones aplicadas:
`20261004120000_payers_and_payment_void`, `20261004180000_suppliers`, `20261004220000_nomina` (+ seed del plan de cuentas).
- **Contabilidad en módulos** estilo QuickBooks (`(finanzas)/modules.ts`): portada con flujo y gráficos, consolidado. Visión y fases: `docs/contabilidad-v2.md`.
- **Pagos** (Clientes › Cobros de socios): filtros en la URL (`src/lib/payments/filters.ts`), una factura de membresía por socio y mes,
  **pagadores** compartidos (`Payer`, factura conjunta de hermanos) y cobros **anulados** (status VOIDED), nunca borrados.
- **Búsqueda sin tildes** en toda la app: `idsMatching` (`src/lib/text-search.ts`) en servidor, `textMatches` (`src/lib/text.ts`) en pantalla.
- **Proveedores** (`Supplier`): cada gasto se enlaza solo por RUC o nombre; Gastos con filtros (`src/lib/expenses/filters.ts`) y antigüedad de cuentas por pagar.
- **Nómina** (Trabajadores › Equipo / Roles de pago): reglas 2026 en `src/lib/payroll/rules.ts` (actualizar `RULES_BY_YEAR` cada enero),
  pruebas en `scripts/test-nomina.ts`, asiento PAYROLL al aprobar el rol.

**Próximo paso concreto:**
- QA con login real de todo lo anterior; cargar el equipo (quién IESS vs factura) y generar el primer rol.
- Siguientes módulos: Caja y Bancos (enlazar pago de sueldos y planilla con el banco), pagos a proveedores (varias facturas, parciales),
  planilla IESS / décimos / utilidades / liquidaciones, empresas en BD para vender la app a otros gimnasios.
- Sigue pendiente: firma .p12 + primer envío al SRI de pruebas; mensaje de `portalSignUp`.
- Ver UI sin login: bypass local temporal descrito en la memoria de la sesión; revertirlo antes del commit.

**Última sesión (3–4 oct 2026):** PRs #123–#130 en producción (main `96812c1`):
- **Ficha única por persona** (socios y leads, `src/components/ficha/`, timeline en `src/lib/ficha/timeline.ts`) con pestaña WhatsApp (responder y plantillas), edición en línea de propiedades y segmentos (automáticos + listas manuales: tablas `Segment`/`SegmentEntry`, migración `20261004000000_segment_lists` ya aplicada).
- **Menú lateral** grafito con grupos plegables, escondible (click o `[`).
- **Listas Leads/Socios** estilo Gambit (`src/components/list/`): vistas, resumen clicable, filtros en la URL. Los números del embudo del Resumen abren Leads filtrado.
- **Asistencia → Calendario** (`?vista=calendario`).
- **WhatsApp tipo CRM**: tres paneles, tarjeta del contacto, Nota interna y vista **Tablero** por etapa (`?vista=tablero`).
- **Seguridad** (#130): admins con sede solo editan y notifican socios de su sede; las notas de socios no se borran.

**Próximo paso concreto:**
- QA con datos reales (nada de lo anterior se vio con login): fichas, edición en línea, listas, plantilla a un número propio, chat + tarjeta del contacto en el inbox, tablero, filtros, calendario.
- Sigue pendiente: firma .p12 + primer envío al SRI de pruebas; nómina (datos de Isabel); mensaje de `portalSignUp` (revela si un correo es socio).
- Para ver UI sin login: ruta temporal sin proteger `src/app/zz-preview/` con datos ficticios, borrarla antes del commit.

**Regla para server actions:** toda función exportada de un archivo `"use server"` verifica sesión y
permiso al inicio (son endpoints públicos). Nunca confiar en ocultar el botón.

---

## Reglas para Claude Code en este repo

1. **Antes de escribir código que use APIs de Next 16, Prisma 7 o React 19** → leer la doc local en `node_modules/`. No asumir APIs de versiones anteriores.
2. **Antes de proponer integraciones** (Stripe, QBO, etc.) → revisar sección "Postergado". Si está ahí, no implementar; preguntar primero.
3. **Antes de modificar el schema** → discutir. Está diseñado holísticamente, modificar sin pensar rompe Fases 2-3.
4. **Para módulos nuevos** → seguir el patrón de `asistencia/` (server actions en `lib/actions/`, panels separados, tipos derivados de Prisma).
5. **Si la sesión se está alargando** → proponer un commit + `/clear` antes de saturar contexto.
6. **Deploy a producción SOLO vía merge a `main`** → nunca `vercel deploy --prod` desde local. Eso bypassea git y deja la prod desincronizada del repo (lo arreglamos el 2026-05-10, ver PR #2). Si necesitas verificar algo antes de mergear, usa el Preview automático que Vercel genera por cada push a una rama.
7. **Migraciones Prisma SOLO commiteadas** → nunca `prisma migrate dev` ni `prisma db push` contra `DIRECT_URL` sin commitear la migración generada. Workflow correcto: editar `schema.prisma` → `prisma migrate dev --name <descripcion>` → revisar `prisma/migrations/<timestamp>_*/migration.sql` → commitear schema + migración juntos → push.
