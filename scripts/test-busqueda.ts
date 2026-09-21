/**
 * Prueba de la búsqueda del inbox.
 *
 * Lo que se verifica aquí es lo que se rompe en silencio: que buscar sin acentos
 * encuentre el texto con acentos (la gente escribe "evaluacion"), que los índices
 * del resaltado apunten al texto ORIGINAL, y que el plegado de JavaScript y el
 * `translate()` de Postgres digan exactamente lo mismo — si se desalinean, la
 * base encuentra resultados que la UI no sabe resaltar.
 *
 * Uso:  npx tsx scripts/test-busqueda.ts
 */

import {
  SQL_ACCENTS_FROM,
  SQL_ACCENTS_TO,
  foldText,
  likePattern,
  matchRanges,
  normalizeQuery,
  snippetAround,
} from "../src/lib/whatsapp/search";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: string) {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
  if (!ok && detalle) console.log(`   ${detalle}`);
}

// ── Plegado ────────────────────────────────────────────────────────────────
// La longitud tiene que conservarse: de eso dependen los índices del resaltado.
const textos = [
  "¿Cuándo es la evaluación?",
  "Señora Muñoz, mañana a las 7",
  "ÁÉÍÓÚ ÑÜÇ àèìòù âêîôû ãõ",
  "Sin acentos, normal",
  "Emojis 💪🔥 y ünïcödé",
];
for (const t of textos) {
  check(
    `foldText conserva la longitud — "${t.slice(0, 24)}…"`,
    foldText(t).length === t.length,
    `original ${t.length}, plegado ${foldText(t).length}`,
  );
}
check('foldText("Evaluación") === "evaluacion"', foldText("Evaluación") === "evaluacion", foldText("Evaluación"));
check('foldText("MUÑOZ") === "munoz"', foldText("MUÑOZ") === "munoz", foldText("MUÑOZ"));
check('normalizeQuery colapsa espacios', normalizeQuery("  la   Evaluación  ") === "la evaluacion");

// ── Coincidencias e índices ────────────────────────────────────────────────
const cuerpo = "Hola, ¿cuándo es la evaluación? Quiero la evaluación del martes.";
const rangos = matchRanges(cuerpo, "EVALUACION");
check("encuentra 2 veces 'evaluacion' sin acentos ni mayúsculas", rangos.length === 2, JSON.stringify(rangos));
check(
  "los índices apuntan al texto original (con tilde)",
  rangos.every((r) => cuerpo.slice(r.start, r.end).toLowerCase() === "evaluación"),
  rangos.map((r) => cuerpo.slice(r.start, r.end)).join(" | "),
);
check("consulta de 1 letra no busca nada", matchRanges(cuerpo, "e").length === 0);
check("consulta vacía no busca nada", matchRanges(cuerpo, "   ").length === 0);
check(
  "busca también al revés: con tilde encuentra lo escrito sin tilde",
  matchRanges("quiero la evaluacion", "evaluación").length === 1,
);

// ── Fragmentos ─────────────────────────────────────────────────────────────
const largo = `${"a".repeat(300)} el precio es 50% ${"b".repeat(300)}`;
const frag = snippetAround(largo, "precio");
check("el fragmento recorta un mensaje largo", frag.text.length < 200, `${frag.text.length} caracteres`);
check("el fragmento marca que hay texto antes y después", frag.leadingEllipsis && frag.trailingEllipsis);
check(
  "la coincidencia sigue bien ubicada dentro del fragmento",
  frag.ranges.length === 1 && frag.text.slice(frag.ranges[0].start, frag.ranges[0].end) === "precio",
  JSON.stringify(frag.ranges),
);
const corto = snippetAround("mensaje corto sin coincidencia", "zzz");
check("sin coincidencia devuelve el texto tal cual", corto.text === "mensaje corto sin coincidencia" && corto.ranges.length === 0);

// ── LIKE: los comodines son texto, no comodines ────────────────────────────
check('likePattern escapa el %', likePattern("50%") === "%50\\%%", likePattern("50%"));
check('likePattern escapa el _', likePattern("plan_a") === "%plan\\_a%", likePattern("plan_a"));
check('likePattern escapa la barra', likePattern("a\\b") === "%a\\\\b%", likePattern("a\\b"));

// ── JS y Postgres tienen que plegar igual ──────────────────────────────────
check(
  "las dos listas de translate() miden lo mismo",
  SQL_ACCENTS_FROM.length === SQL_ACCENTS_TO.length,
  `${SQL_ACCENTS_FROM.length} vs ${SQL_ACCENTS_TO.length}`,
);
/** El translate() de Postgres, reimplementado, para comparar contra foldText. */
function sqlFold(text: string): string {
  const map = new Map([...SQL_ACCENTS_FROM].map((c, i) => [c, SQL_ACCENTS_TO[i]]));
  return [...text.toLowerCase()].map((c) => map.get(c) ?? c).join("");
}
for (const t of [...textos, "Cañón", "Perú", "Ángel Güell", cuerpo]) {
  check(
    `JS y SQL pliegan igual — "${t.slice(0, 24)}…"`,
    sqlFold(t) === foldText(t),
    `sql="${sqlFold(t)}"\n   js ="${foldText(t)}"`,
  );
}

console.log(fallos === 0 ? "\n✅ Todo correcto (búsqueda)" : `\n❌ ${fallos} fallo(s) (búsqueda)`);
process.exit(fallos === 0 ? 0 : 1);
