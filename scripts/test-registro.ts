/**
 * Prueba del registro: que el bot no suene rioplatense.
 *
 * El 21 sep 2026 Santiago notó que el bot "hablaba con acento argentino". Eran
 * 8 de 226 mensajes, todos con "contame". El prompt ya lo prohíbe; esto verifica
 * la red determinista que lo cierra — y sobre todo que NO rompa texto correcto
 * ("nosotros", "sostén", "dale", que en Ecuador se usa con naturalidad).
 *
 * Uso:  npx tsx scripts/test-registro.ts
 */

import { neutralizeVoseo } from "../src/lib/whatsapp/agent";

const casos: Array<[string, string]> = [
  // Los casos reales que salieron en producción
  ["Y contame, ¿prefieres entrenar en la mañana o en la tarde?", "Y cuéntame, ¿prefieres entrenar en la mañana o en la tarde?"],
  ["Contame, ¿cuál es tu objetivo principal?", "Cuéntame, ¿cuál es tu objetivo principal?"],
  // Capitalización
  ["CONTAME ya", "CUÉNTAME ya"],
  // Otras formas
  ["Vení mañana, tenés cupo y podés elegir horario.", "Ven mañana, tienes cupo y puedes elegir horario."],
  ["¿Sos de Sangolquí?", "¿Eres de Sangolquí?"],
  // Lo que NO debe tocar
  ["Nosotros te esperamos, sostén la barra.", "Nosotros te esperamos, sostén la barra."],
  ["Dale, te espero mañana 💪", "Dale, te espero mañana 💪"],
  ["Tu sesión es a las 7. ¡Nos vemos!", "Tu sesión es a las 7. ¡Nos vemos!"],
  ["Cuéntame qué día te queda mejor", "Cuéntame qué día te queda mejor"],
  ["El entrenamiento es personalizado y con datos.", "El entrenamiento es personalizado y con datos."],
];

let fallos = 0;
for (const [entrada, esperado] of casos) {
  const real = neutralizeVoseo(entrada);
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${entrada}`);
  if (!ok) console.log(`   esperaba: ${esperado}\n   obtuvo:   ${real}`);
}
console.log(`\n${casos.length - fallos}/${casos.length} correctos`);
process.exit(fallos > 0 ? 1 : 0);
