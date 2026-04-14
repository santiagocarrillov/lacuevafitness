# La Cueva — Dashboard SRXFit

Dashboard operativo y plataforma propia de **La Cueva Fitness Center** y **La Cueva Xtreme**. Reemplaza el flujo actual (Google Sheets + HubSpot Free + WhatsApp + QuickBooks a mano) y sistematiza la metodología **SRXFit** (Scientifically Prescribed Fitness).

## Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui**
- **Supabase** — Auth + Postgres + Storage
- **Prisma 7** (driver adapter `@prisma/adapter-pg`)
- **Stripe** (suscripciones recurrentes)
- **QuickBooks Online** (conciliación contable)
- Deploy: **Vercel** (subdominio `dashboard.lacueva.com`)

## Fases del producto

1. **Fase 1 — Dashboard Operativo** (MVP): socios, asistencia rápida + confirmación de coach antifraude, leads, pagos, conciliación, reportes.
2. **Fase 2 — Portal SRXFit**: onboarding, batería de tests, bioimpedancia, ciclos de 9 semanas, comparativos.
3. **Fase 3 — App de miembro**: rutina del día, progreso, pagos, plan nutricional (PWA → React Native).
4. **Fase 4** — Reservas y control de acceso.
5. **Fase 5** — Retención, predicción de churn, integración con chatbot de ventas.

Plan completo: `/Users/santiagocarrillo/.claude/plans/vectorized-twirling-dusk.md`.

## Arranque local

```bash
# 1. Copiar variables de entorno
cp .env.example .env
# Rellenar Supabase URL/keys, DATABASE_URL, Stripe, QBO…

# 2. Instalar dependencias
npm install

# 3. Sincronizar schema con Postgres (primera vez)
npx prisma migrate dev --name init

# 4. Generar cliente Prisma
npx prisma generate

# 5. Correr dev server
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Estructura

```
src/
├── app/
│   ├── page.tsx                # Landing pública
│   ├── login/                  # Auth (Supabase)
│   └── dashboard/              # Área autenticada
│       ├── layout.tsx          # Sidebar nav
│       ├── page.tsx            # Resumen / KPIs
│       ├── asistencia/         # Registro + confirmación coach
│       ├── socios/             # CRM
│       ├── leads/              # Pipeline de ventas
│       ├── pagos/              # Stripe + conciliación QBO
│       ├── reportes/           # Analítica
│       └── srxfit/             # Evaluaciones (Fase 2)
├── components/ui/              # shadcn
├── lib/
│   ├── prisma.ts               # PrismaClient singleton con adapter-pg
│   └── supabase/{server,client}.ts
└── generated/prisma/           # Cliente Prisma generado
prisma/schema.prisma            # Modelo completo (Fases 1-3)
```

## Roles (enum `UserRole`)

- `OWNER` — Santiago. Vista completa, ambas sedes.
- `ACCOUNTING` — Isabel. Pagos, conciliación, caja.
- `ADMIN` — admin de sede. Su sede únicamente.
- `COACH` — confirma conteo al cierre de clase.
- `NUTRITIONIST` — composición corporal, planes nutricionales.
- `MEMBER` — acceso a la app móvil (Fase 3).

## Scripts útiles

```bash
npm run dev            # Next dev con Turbopack
npm run build          # Build producción
npm run lint           # ESLint
npx prisma studio      # Explorar la DB en UI
npx prisma format      # Formatear schema.prisma
npx prisma validate    # Validar schema
```

---

© La Cueva · SRXFit — Scientifically Prescribed Fitness · Documento interno confidencial.
