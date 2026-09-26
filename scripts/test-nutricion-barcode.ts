/**
 * Prueba del mapeo de Open Food Facts (src/lib/nutrition/off.ts) con respuestas
 * reales guardadas en scripts/fixtures (Nutella, Coca-Cola). No llama a la API.
 *
 * Uso:  npm run test:nutricion-barcode
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { mapOffProduct, normalizeBarcode } from "../src/lib/nutrition/off";
import { validateFoodInput } from "../src/lib/nutrition/food-input";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: unknown) {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${!ok && detalle !== undefined ? ` → ${JSON.stringify(detalle)}` : ""}`);
}
const fixture = (code: string) => JSON.parse(readFileSync(resolve(__dirname, `fixtures/off-${code}.json`), "utf8"));

check("normaliza código con espacios/guiones", normalizeBarcode(" 7 861001-200138 ") === "7861001200138");
check("rechaza códigos cortos", normalizeBarcode("12345") === null);

const nutella = mapOffProduct(fixture("3017620422003"), "3017620422003");
check("Nutella: nombre y marca", nutella?.name === "Nutella" && nutella.brand === "Nutella", nutella);
check("Nutella: macros por 100 g", nutella?.kcal === 539 && nutella.proteinG === 6.3 && nutella.carbsG === 57.5 && nutella.fatG === 30.9, nutella);
check("Nutella: sodio g → mg", nutella?.sodiumMg === 43, nutella?.sodiumMg);
check("Nutella: sólido", nutella?.isLiquid === false);
check("Nutella pasa nuestra validación", (() => { try { validateFoodInput(nutella!); return true; } catch (e) { return String(e); } })() === true);

const coca = mapOffProduct(fixture("5449000000996"), "5449000000996");
check("Coca-Cola: líquido por la cantidad en ml", coca?.isLiquid === true, coca);
check("Coca-Cola: porción de 330", coca?.portions?.[0]?.grams === 330, coca?.portions);
check("Coca-Cola: 42 kcal, 10.6 g carbos", coca?.kcal === 42 && coca.carbsG === 10.6);
check("Coca-Cola: fibra ausente queda null", coca?.fiberG === null);

check("producto inexistente → null", mapOffProduct({ status: 0, status_verbose: "product not found" }, "0000000000000") === null);
check("sin macros → null", mapOffProduct({ status: 1, product: { product_name: "X", nutriments: { "energy-kcal_100g": 100 } } }, "12345678") === null);
check(
  "energía solo en kJ se convierte",
  mapOffProduct({ status: 1, product: { product_name: "Y", nutriments: { energy_100g: 418.4, proteins_100g: 5, carbohydrates_100g: 15, fat_100g: 1 } } }, "12345678")?.kcal === 100,
);

console.log(fallos === 0 ? "\nTodo OK" : `\n${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
