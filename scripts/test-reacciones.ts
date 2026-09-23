/**
 * Prueba de cómo se muestran las reacciones de WhatsApp en el hilo.
 *
 * Uso:  npx tsx scripts/test-reacciones.ts
 */

import { reactionBody } from "../src/lib/whatsapp/reactions";

let fallos = 0;
function check(nombre: string, got: string, want: string) {
  const ok = got === want;
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
  if (!ok) console.log(`   esperado: ${want}\n   obtenido: ${got}`);
}

check("emoji + mensaje reaccionado", reactionBody("👍", "La última hora de clases en la mañana es de 9 a 10"),
  "Reaccionó 👍 a: «La última hora de clases en la mañana es de 9 a 10»");
check("emoji sin mensaje conocido", reactionBody("❤️", null), "Reaccionó ❤️");
check("emoji vacío = quitó la reacción", reactionBody("", "Hola"), "Quitó su reacción a: «Hola»");
check("sin emoji ni mensaje", reactionBody(undefined, null), "Quitó su reacción");
check("mensaje largo y con saltos se recorta a una línea",
  reactionBody("😂", "¡Hola, Ibeth!\n\nTenemos dos sedes en Sangolquí y te paso las dos ubicaciones aquí abajo"),
  "Reaccionó 😂 a: «¡Hola, Ibeth! Tenemos dos sedes en Sangolquí y te paso las…»");

console.log(fallos ? `\n❌ ${fallos} fallo(s)` : "\n✅ Todo correcto (reacciones)");
process.exit(fallos ? 1 : 0);
