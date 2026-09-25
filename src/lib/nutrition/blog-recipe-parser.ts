// Tolerant parser for the recipes rescued from the old WordPress blog
// (RESCATE_lacuevafitnesscenter/blog_posts/*.txt). Each file has a header
// (TÍTULO / FECHA / URL), an intro, "Ingredientes", "Instrucciones" and a
// "Tabla Nutricional" whose cells were flattened one-per-line.

export type ParsedBlogRecipe = {
  title: string;
  date: string | null;
  url: string | null;
  description: string | null;
  ingredients: { label: string; grams: number | null }[];
  instructions: string;
  servings: number;
  nutrition: { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number | null } | null;
};

const WORD_NUMBERS: Record<string, number> = {
  una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, diez: 10, doce: 12,
};

function clean(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function num(s: string): number {
  return Number(s.replace(",", "."));
}

export function cleanTitle(raw: string): string {
  return raw
    .split("|")[0]
    .replace(/^\s*(receta(s)?( saludable)?:?|rectea|recetas la cueva:?)\s*/i, "")
    .replace(/\s*(receta )?saludable\s*$/i, "")
    .replace(/^de\s+/i, "")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Grams (or ml, treated as grams) mentioned in an ingredient line. Prefers the
 * explicit "(aproximadamente 150 gramos)" / "100g" / "90 ml" form.
 */
export function gramsFromLabel(label: string): number | null {
  const m = label.match(/(\d+(?:[.,]\d+)?)\s*(g|gr|grs|gramos?|ml|mililitros?)\b/i);
  if (!m) return null;
  const n = num(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sectionIndex(lines: string[], re: RegExp, from = 0): number {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i;
  return -1;
}

/** Value that follows a label cell in the flattened nutrition table. */
function tableValue(lines: string[], start: number, label: RegExp): number | null {
  for (let i = start; i < lines.length; i++) {
    if (!label.test(lines[i])) continue;
    // Value may be on the same line ("Calorías 72") or on one of the next ones.
    const same = lines[i].replace(label, "").match(/(\d+(?:[.,]\d+)?)/);
    if (same) return num(same[1]);
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      const m = lines[j].match(/^~?\s*(\d+(?:[.,]\d+)?)/);
      if (m) return num(m[1]);
      if (lines[j]) break;
    }
  }
  return null;
}

function parseServings(text: string): number {
  const rinde = text.match(/rinde (?:para )?(\d+|\w+) porciones/i) ?? text.match(/para (\d+|\w+) porciones/i);
  if (rinde) {
    const v = /^\d+$/.test(rinde[1]) ? Number(rinde[1]) : WORD_NUMBERS[rinde[1].toLowerCase()];
    if (v) return v;
  }
  const frac = text.match(/porci[oó]n:\s*1\/(\d+) de la receta/i);
  if (frac) return Number(frac[1]);
  return 1;
}

export function parseBlogRecipe(text: string): ParsedBlogRecipe | null {
  const rawLines = text.split(/\r?\n/);
  const header = (key: string) => {
    const l = rawLines.find((x) => x.startsWith(`${key}:`));
    return l ? l.slice(key.length + 1).trim() : null;
  };
  const titleRaw = header("TÍTULO");
  if (!titleRaw) return null;

  const lines = rawLines.map(clean);
  const iIng = sectionIndex(lines, /^ingredientes\b/i);
  const iIns = sectionIndex(lines, /^(instrucciones|preparaci[oó]n)\b/i, Math.max(0, iIng));
  const iTab = sectionIndex(lines, /^tabla nutricional/i, Math.max(0, iIns));
  if (iIng < 0 || iIns < 0) return null;

  const intro = lines
    .slice(0, iIng)
    .filter((l) => l && !/^(TÍTULO|FECHA|URL):/.test(l));
  const description = intro.length ? intro.join(" ").slice(0, 600) : null;

  const ingredients = lines
    .slice(iIng + 1, iIns)
    .filter((l) => l && !/^para (la|el) /i.test(l))
    .map((label) => ({ label, grams: gramsFromLabel(label) }));

  const insEnd = iTab > 0 ? iTab : lines.length;
  const instructions = lines
    .slice(iIns + 1, insEnd)
    .filter(Boolean)
    .join("\n");

  let nutrition: ParsedBlogRecipe["nutrition"] = null;
  if (iTab > 0) {
    const kcal = tableValue(lines, iTab, /^calor[ií]as( totales)?\b/i);
    const proteinG = tableValue(lines, iTab, /^prote[ií]nas?\b/i);
    const fatG = tableValue(lines, iTab, /^grasas?( totales?)?$/i) ?? tableValue(lines, iTab, /^grasas?\b(?!.*saturad)/i);
    const carbsG = tableValue(lines, iTab, /^(carbohidratos( totales)?|hidratos de carbono)\b/i);
    const fiberG = tableValue(lines, iTab, /^fibra\b/i);
    if (kcal !== null && proteinG !== null && carbsG !== null && fatG !== null) {
      nutrition = { kcal, proteinG, carbsG, fatG, fiberG };
    }
  }

  return {
    title: cleanTitle(titleRaw),
    date: header("FECHA"),
    url: header("URL")?.replace(/%20$/, "") ?? null,
    description,
    ingredients,
    instructions,
    servings: parseServings(text),
    nutrition,
  };
}
