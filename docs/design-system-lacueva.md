# Sistema de diseño — La Cueva SRXFIT

> Guía de la línea gráfica de La Cueva. **La fuente de verdad viva son los tokens
> en `src/app/(marketing)/marketing.css` (bajo `.mkt`)** — este doc explica el
> *porqué* y sirve para restilizar la app (hoy genérica: blanco + Geist).

## Cómo usar esto para restilizar la app

La web y la app comparten repo pero **NO comparten estilos**: los tokens de La Cueva
viven bajo `.mkt`, no en `:root`, justamente para no tocar el dashboard sin querer.
Para el restyle de la app:

1. Copia los tokens de `.mkt` (colores, fuentes) a un scope de la app o a `:root` si
   se decide que TODO adopte la marca. **No** los declares globalmente sin querer
   mientras la web depende de ellos — verifica que la web siga bien.
2. Las fuentes ya están self-hosteadas vía `next/font/local` en `(marketing)/layout.tsx`.
   Para usarlas en la app, expón sus `variable` en el root layout o duplica la carga.
3. La app es funcional (tablas, formularios, datos densos) — el brutalismo del hero NO
   aplica ahí. Usa la **paleta** y las **fuentes de datos** (Barlow Condensed), no los
   titulares gigantes. IMPACTED es para momentos de marca, no para un dashboard.

---

## Marca (lo que NO se re-litiga)

- **Concepto:** no es un gimnasio de músculo. Es transformarse en mejor versión de uno
  mismo; **salud y longevidad primero**, el cuerpo llega como consecuencia.
- **Comunidad = Cavernarios** (no "tribu"). Un cavernario cuida lo natural pero mira al futuro.
- **Arquetipos:** Explorador (principal) + Guerrero (secundario).
- **Voz:** entrenador que inspira. Con autoridad, con calma, con propósito. **Nunca promete
  cuerpos perfectos.**
- **Estilo visual:** minimalista, muy contrastado, editorial (revista, no catálogo),
  atlético, brutalista, orgánico. **NO** fisicoculturismo, **NO** boutique. La "cueva" es
  más clara y divertida (tipo Splash Mountain), no oscura.
- **Las dos sedes entrenan lo mismo (SRXFIT).** No usar CrossFit/funcional.

## Color

Blanco y negro dominan; los acentos son la **escala de zonas SRXFIT** — un degradado
*con propósito* (no decorativo): representa la intensidad de recuperación a pico.

| Token | Hex | Rol |
|---|---|---|
| `--black` | `#0B0B0B` | Texto, secciones "cueva" |
| `--white` | `#FFFFFF` | Fondo editorial dominante |
| `--slate-graphite` | `#1B1F23` | Base oscura (de srxfit.com; no negro puro) |
| `--cal-recovery` | `#6B4FB5` | Zona: recuperación (morado) |
| `--cal-zone2` | `#3A8FD1` | Zona 2 (azul) |
| `--cal-strength` | `#00D4C4` | Fuerza (turquesa) |
| `--cal-power` | `#C9F543` | Potencia (chartreuse) |
| `--cal-threshold` | `#F5A623` | Umbral (naranja) |
| `--cal-peak` | `#FF6B5A` | Pico (rojo) |
| `--grad-cal` | — | El degradado de las 6 zonas en orden |

El brief viejo hablaba de "morado a rojo" y "verde fosforescente"; al inspeccionar
srxfit.com resultó ser **esta escala de zonas**. Es la misma en ambos sitios y tiene
significado — usarla como sistema, no como adorno.

## Tipografía

| Fuente | Rol | Regla |
|---|---|---|
| **IMPACTED 2.0** (`--display`) | Titulares brutalistas | Va **sólido**; su textura desgarrada ya es el efecto. **Nunca** con `-webkit-text-stroke` (ensucia la textura). |
| **JungleFever** (`--brand`) | Marca / palabras muy importantes | **Nunca** para párrafos. Hoy la marca es el logo (imagen), así que casi no se usa como fuente. |
| **Barlow Condensed** (`--sans`) | Subtítulos, datos, fechas, detalles | La más usada. Es la que más sirve para la app. |
| **Barlow Semi Condensed** (`--sans2`) | Cuerpo | Texto general. |
| **brush-script-std** (`--brush`) | Firma / emoción | Vía **Adobe Typekit** (`use.typekit.net/imy7tie.css`), atado a dominios. Usar con moderación, como una firma. |

Sustitutos (fallback si no cargan): Anton (display), Caveat (brush).

**Pendientes de licencia:** Impacted y JungleFever son TTF de escritorio; embeberlas en web
requiere licencia web — confirmar antes de escalar. Typekit necesita `lacuevasrxfit.com`
y `*.vercel.app` autorizados en el kit.

## Fotografía

- Grandes, de alto contraste, curadas como galería. **Poco texto por pantalla, cada sección respira.**
- En la web las fotos van en **grayscale con hover a color** (editorial). Las panorámicas
  necesitan **bandas full-width**, no cards verticales (el `object-fit: cover` mata el encuadre).
- Referencias: Nike Training, Rogue, NOBULL, YETI (simplicidad), revistas de moda.

## Motion (patrones ya construidos en la web)

- **Spotlight del mouse:** halo radial con colores de zona + `mix-blend-mode: screen`,
  seguimiento con easing (`useSpotlight`). Presente en hero y método.
- **Recorrido del método:** ruta SVG horizontal ascendente; cámara que panea en X con el
  scroll (el viaje avanza y sube, nunca baja); figura que cambia de color por la escala de
  zonas. Render **por evento de scroll**, no bucle rAF.
- **Flywheel del ciclo:** aro giratorio con el ciclo SRXFIT, réplica del de srxfit.com.

## Reglas aprendidas (no repetir errores)

- `overflow-x: hidden` en un contenedor con `position: sticky` adentro **rompe el sticky**
  (crea contenedor de scroll). Usar `clip`.
- `next/image`: declarar `width`/`height` cercanos al **tamaño de render** (2x retina), no el
  tamaño del archivo — si no, sirve imágenes enormes.
- Assets crudos (`.mov`, `.ai`, `.psd`, HEIC) viven en `web/` (git-ignored). Al repo solo
  entran los optimizados en `public/`.
