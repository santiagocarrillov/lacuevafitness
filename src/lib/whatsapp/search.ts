/**
 * Búsqueda del inbox — plegado de acentos y recorte de fragmentos.
 *
 * Aquí se busca en español real: la gente escribe "evaluacion" y el bot contesta
 * "evaluación", así que un ILIKE pelado deja fuera la mitad de los resultados. La
 * solución es plegar acentos en los dos lados de la comparación.
 *
 * El plegado es **char a char y 1:1 a propósito**: el texto plegado conserva las
 * mismas posiciones que el original, así que un `indexOf` sobre el plegado sirve
 * para resaltar el original sin volver a buscar. Si un carácter no pliega a un
 * único carácter (casos raros fuera del español), se deja su minúscula para no
 * mover los índices.
 *
 * `SQL_ACCENTS_FROM` / `SQL_ACCENTS_TO` son el mismo plegado del lado de Postgres
 * vía `translate()`. Se hace con `translate` y no con la extensión `unaccent`
 * para no depender de un `CREATE EXTENSION` en Supabase: cero migraciones.
 * Mantener las dos listas alineadas — `scripts/test-busqueda.ts` lo verifica.
 */

/** Longitud mínima de la consulta. Menos que esto devuelve el inbox entero. */
export const MIN_QUERY_LENGTH = 2;

/** Pares acento → base, en el orden exacto que espera `translate()` de Postgres. */
const ACCENT_PAIRS: Array<[string, string]> = [
  ["á", "a"], ["à", "a"], ["ä", "a"], ["â", "a"], ["ã", "a"],
  ["é", "e"], ["è", "e"], ["ë", "e"], ["ê", "e"],
  ["í", "i"], ["ì", "i"], ["ï", "i"], ["î", "i"],
  ["ó", "o"], ["ò", "o"], ["ö", "o"], ["ô", "o"], ["õ", "o"],
  ["ú", "u"], ["ù", "u"], ["ü", "u"], ["û", "u"],
  ["ñ", "n"], ["ç", "c"],
];

/** Lado izquierdo de `translate(lower(col), from, to)`. Ya en minúsculas. */
export const SQL_ACCENTS_FROM = ACCENT_PAIRS.map(([from]) => from).join("");
/** Lado derecho de `translate(lower(col), from, to)`. */
export const SQL_ACCENTS_TO = ACCENT_PAIRS.map(([, to]) => to).join("");

/**
 * Minúsculas + sin acentos, conservando la longitud original carácter a carácter.
 * `foldText(s).length === s.length` siempre — de eso dependen los resaltados.
 */
export function foldText(text: string): string {
  let out = "";
  for (const ch of text) {
    const lower = ch.toLowerCase();
    // Un carácter puede crecer al pasar a minúsculas (İ → i̇). Si crece, se deja
    // el original en minúsculas solo si sigue midiendo lo mismo; si no, el crudo.
    const base = lower.length === ch.length ? lower : ch;
    const stripped = base.normalize("NFD").replace(/[̀-ͯ]/g, "");
    out += stripped.length === base.length ? stripped : base;
  }
  return out;
}

/** Consulta lista para comparar: sin espacios sobrantes, plegada. */
export function normalizeQuery(query: string): string {
  return foldText(query.trim().replace(/\s+/g, " "));
}

/** true si la consulta da para buscar (evita barrer todo con una sola letra). */
export function isSearchable(query: string): boolean {
  return normalizeQuery(query).length >= MIN_QUERY_LENGTH;
}

export type MatchRange = { start: number; end: number };

/**
 * Posiciones (en el texto ORIGINAL) donde aparece la consulta, sin acentos ni
 * mayúsculas de por medio. Vacío si la consulta no es buscable.
 */
export function matchRanges(text: string, query: string): MatchRange[] {
  const needle = normalizeQuery(query);
  if (needle.length < MIN_QUERY_LENGTH) return [];
  const hay = foldText(text);
  const ranges: MatchRange[] = [];
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at === -1) break;
    ranges.push({ start: at, end: at + needle.length });
    from = at + needle.length;
  }
  return ranges;
}

export type Snippet = {
  /** Trozo del mensaje alrededor de la primera coincidencia. */
  text: string;
  /** Coincidencias ya reubicadas dentro de `text`. */
  ranges: MatchRange[];
  leadingEllipsis: boolean;
  trailingEllipsis: boolean;
};

/**
 * Recorta el mensaje alrededor de la primera coincidencia, como la lista de
 * resultados de WhatsApp: un mensaje de 800 caracteres no puede ocupar la
 * pantalla solo porque la palabra buscada está al final.
 */
export function snippetAround(text: string, query: string, radius = 42): Snippet {
  const ranges = matchRanges(text, query);
  if (ranges.length === 0) {
    const cut = text.length > radius * 3;
    return {
      text: cut ? text.slice(0, radius * 3) : text,
      ranges: [],
      leadingEllipsis: false,
      trailingEllipsis: cut,
    };
  }

  const first = ranges[0];
  const start = Math.max(0, first.start - radius);
  const end = Math.min(text.length, first.end + radius * 2);
  return {
    text: text.slice(start, end),
    ranges: ranges
      .filter((r) => r.start >= start && r.end <= end)
      .map((r) => ({ start: r.start - start, end: r.end - start })),
    leadingEllipsis: start > 0,
    trailingEllipsis: end < text.length,
  };
}

/**
 * Patrón para un `LIKE` de Postgres con la consulta YA plegada. Escapa los
 * comodines para que buscar "50%" o "plan_a" no barra media base.
 */
export function likePattern(foldedQuery: string): string {
  return `%${foldedQuery.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
