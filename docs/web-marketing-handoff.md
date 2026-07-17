# Handoff — Web pública La Cueva SRXFIT

**Actualizado:** jul-2026 · **Estado:** Fases 1–2 completas, en producción.

## TL;DR

`lacuevasrxfit.com` está **en vivo** con la web de marketing nueva, en el **mismo repo y
proyecto de Vercel** que la app (`lacuevafitness`). La app quedó como subdirectorio.
Sistema de diseño: `docs/design-system-lacueva.md`.

## Arquitectura

Un solo repo, un solo proyecto de Vercel, un solo dominio:

```
lacuevasrxfit.com/            → web marketing   (src/app/(marketing)/page.tsx)
lacuevasrxfit.com/login       → app (login)
lacuevasrxfit.com/dashboard   → app (staff)
lacuevasrxfit.com/portal      → app (socios)
```

- La web vive en un **route group `(marketing)`** con su propio `layout.tsx` y `marketing.css`.
- **Tokens scoped a `.mkt`, NO a `:root`** — para no restilizar el dashboard. Este es el
  invariante más importante: la app conserva Geist/shadcn hasta que se restilice a propósito.
- El placeholder viejo de `/` (`src/app/page.tsx`) se **eliminó** (colisionaba con el route group).

### Archivos clave

```
src/app/(marketing)/
  layout.tsx            # fuentes (next/font/local + Typekit), metadata, wrapper .mkt
  marketing.css         # ← FUENTE DE VERDAD del design system (tokens bajo .mkt)
  page.tsx              # composición del home
  fonts/                # Impacted.ttf, JungleFeverNF.ttf
src/components/marketing/
  nav / hero / method / sedes / closing / footer / conversion-widget
  use-spotlight.ts      # halo del mouse (hero + método)
public/img/  public/video/   # assets optimizados
web/                    # (git-ignored) fuentes crudas de diseño ~300MB
```

## DNS / dominio (hecho)

- `lacuevasrxfit.com` comprado en **Cloudflare**, apuntando a Vercel. Apex hace **308 → www**.
- Cloudflare está **proxeando** (naranja). Funciona; si aparecen rarezas de SSL/caché, ese es
  el primer sospechoso. Si se prefiere apex sin www, se cambia en Vercel → Domains.

## Verificado en producción

- `/` sirve la web nueva · `/login` 200 · fix del sticky (`overflow-x:clip`) en el CSS servido
  · logo nuevo (ratio 1.52, ~11KB).

## Pendiente del usuario (bloquea calidad, no deploy)

1. **Typekit** — autorizar `lacuevasrxfit.com` + `*.vercel.app` en Adobe Fonts, o el brush
   script cae al fallback en silencio.
2. **Licencia web** de Impacted y JungleFever (son TTF de escritorio).

## Roadmap — siguientes fases

| # | Fase | Notas |
|---|---|---|
| **3** | **Widget de conversión real** | Hoy `conversion-widget.tsx` es placeholder. Cablear WhatsApp/IA — la lógica vive en `src/lib/whatsapp/`. **Sin esto el sitio no capta leads.** |
| **4** | **Blog + redirects 301** | 44 posts en `RESCATE_lacuevafitnesscenter/blog_posts/` (~27 recetas + ~17 artículos, formato `TÍTULO:/FECHA:/URL:`). Fotos en `galeria_seleccion/recetas`. El `middleware.ts` de redirects ya está escrito en `RESCATE.../redirects/`. Recupera SEO y **mata el spam de casino** del WP viejo. Rutas que asumen los redirects: `/blog`, `/blog/[slug]`. |
| **5** | **Galería** | `RESCATE.../galeria_seleccion/fotos_reales` (26), `galeria_antes_despues` (18 archivos → 13 únicos, hay dups por md5), fotos actuales en `web/sources/JPEG`. ⚠️ Antes/después son personas identificables — confirmar consentimiento, sobre todo las de 2023. |
| **6** | **Restyle de la app** | Consumir los tokens de `marketing.css`. Ver `docs/design-system-lacueva.md`. Interno, cero impacto en ventas → va al final. |

## Reglas del repo (respetar)

- **Deploy a prod SOLO por merge a `main`** (nunca `vercel deploy --prod`).
- **Next 16 / React 19 / Prisma 7** tienen APIs cambiadas → leer `node_modules/next/dist/docs/`
  antes de escribir. Ver `AGENTS.md`.
- Prisma: cliente desde `@/lib/prisma` (no `@prisma/client`); migraciones commiteadas.

## Notas de las sesiones de construcción

- El preview headless del entorno **no hace scroll de páginas largas ni renderiza bien `vh`/
  `sticky`** — verificar por HTTP/JS y en el Preview real de Vercel, no solo por screenshot.
- Un par de "bugs" reportados fueron **falsos negativos de tests mal escritos** (curl sin `-L`,
  patrón de CSS de una versión vieja de Next). Verificar el test antes de perseguir el fantasma.
