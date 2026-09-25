// Parser for prisma/seed-data/foods-ec.csv (";"-separated, "#" comment lines).
import { EXCHANGE_GROUPS, exchangeGramsFor, type ExchangeGroup } from "./exchanges";
import type { Portion } from "./nutrients";

export type SeedFood = {
  name: string;
  group: ExchangeGroup | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  portions: Portion[];
  isLiquid: boolean;
  sourceNote: string;
  exchangeGrams: number | null;
};

export function parseFoodsCsv(text: string): SeedFood[] {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const [, ...data] = rows; // drop header
  return data.map((line, i) => {
    const [name, group, kcal, protein, carbs, fat, fiber, portions, liquid, source] = line.split(";");
    const g = group?.trim() || null;
    if (g && !(EXCHANGE_GROUPS as readonly string[]).includes(g)) {
      throw new Error(`Fila ${i + 2}: grupo inválido "${g}"`);
    }
    const food = {
      name: name.trim(),
      group: g as ExchangeGroup | null,
      kcal: Number(kcal),
      proteinG: Number(protein),
      carbsG: Number(carbs),
      fatG: Number(fat),
      fiberG: fiber?.trim() ? Number(fiber) : null,
      portions: (portions ?? "")
        .split("|")
        .filter(Boolean)
        .map((p) => {
          const [label, grams] = p.split(":");
          return { label: label.trim(), grams: Number(grams) };
        }),
      isLiquid: liquid?.trim() === "1",
      sourceNote: source?.trim() === "Estimación" ? "Estimación La Cueva" : "USDA FoodData Central",
    };
    for (const k of ["kcal", "proteinG", "carbsG", "fatG"] as const) {
      if (!Number.isFinite(food[k])) throw new Error(`Fila ${i + 2} (${food.name}): ${k} inválido`);
    }
    return { ...food, exchangeGrams: exchangeGramsFor(food.group, food) };
  });
}
