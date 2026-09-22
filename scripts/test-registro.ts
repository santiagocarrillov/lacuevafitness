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

import { neutralizeVoseo, normalizeRegistro, preferChevere } from "../src/lib/whatsapp/agent";
import { templateName } from "../src/lib/whatsapp/templates";
import { renderTemplate } from "../src/lib/whatsapp/templates";

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
console.log(`\n${casos.length - fallos}/${casos.length} correctos (registro)`);

// ── La palabra de la casa: "chévere", nunca "bacán" ──────────────────────
// Santiago lo pidió el 22 sep 2026 sobre un mensaje real del bot. Ojo con el
// caso que lo motivó: no basta con cambiar la palabra, hay que meter el "qué".
const chevere: Array<[string, string]> = [
  // El mensaje exacto que salió en producción
  ["¡Hola! Bacán que te animes 💪", "¡Hola! Qué chévere que te animes 💪"],
  // Ya trae el "qué": solo se cambia la palabra, sin duplicarlo
  ["¡Qué bacán que te animes!", "¡Qué chévere que te animes!"],
  ["Qué bacán, te espero", "Qué chévere, te espero"],
  // Suelto
  ["Bacán, nos vemos mañana", "Chévere, nos vemos mañana"],
  ["Eso está bacán", "Eso está chévere"],
  // Mayúsculas
  ["BACÁN que vengas", "QUÉ CHÉVERE que vengas"],
  // Sin tilde, como lo escribiría un lead
  ["bacan que te animes", "qué chévere que te animes"],
  // Lo que NO debe tocar
  ["Qué chévere que te animes", "Qué chévere que te animes"],
  ["Nos vemos, pana", "Nos vemos, pana"],
  ["Entrenamos full esta semana", "Entrenamos full esta semana"],
];
for (const [entrada, esperado] of chevere) {
  const real = preferChevere(entrada);
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${entrada}`);
  if (!ok) console.log(`   esperaba: ${esperado}\n   obtuvo:   ${real}`);
}

// Las dos capas juntas, que es como se aplica de verdad.
const ambas = normalizeRegistro("Contame, ¿te animas? ¡Bacán que preguntes!");
const esperadoAmbas = "Cuéntame, ¿te animas? ¡Qué chévere que preguntes!";
const okAmbas = ambas === esperadoAmbas;
if (!okAmbas) fallos++;
console.log(`${okAmbas ? "✅" : "❌"} normalizeRegistro aplica voseo + chévere en una pasada`);
if (!okAmbas) console.log(`   esperaba: ${esperadoAmbas}\n   obtuvo:   ${ambas}`);

// ── Nombres que van dentro de las plantillas ─────────────────────────────
// Vienen del perfil de WhatsApp y son basura con frecuencia. Lo que NO puede
// pasar es mandar "¡Hola Sin!" o "¡Hola Te!" a un cliente real.
const nombres: Array<[string, string | null, string]> = [
  ["Nadia", null, "Nadia"],
  ["kevin❤️", null, "Kevin"],
  ["🌒..H..🪐⏳", null, "qué tal"],
  ["666", null, "qué tal"],
  ["Sin nombre", null, "qué tal"],
  ["Te", "Amo Mi Pichuris🥰💋", "qué tal"],
  ["🩷", "María", "María"],
  ["R.C.", null, "qué tal"],
  ["👹👹Nelson", null, "Nelson"],
  ["📝", "contacto sin nombre", "qué tal"],
  ["𝓛𝓲𝔃𝓮𝓽𝓽𝓮", null, "𝓛𝓲𝔃𝓮𝓽𝓽𝓮"],
  ["ricardoalexdelgado", null, "Ricardoalexdelgado"],
  [" ", "Arcos", "Arcos"],
];

let fallosN = 0;
for (const [first, last, esperado] of nombres) {
  const real = templateName(first, last);
  const ok = real === esperado;
  if (!ok) fallosN++;
  console.log(`${ok ? "✅" : "❌"} templateName(${JSON.stringify(first)}, ${JSON.stringify(last)}) → "${real}"`);
  if (!ok) console.log(`   esperaba: "${esperado}"`);
}
console.log(`\n${nombres.length - fallosN}/${nombres.length} correctos (nombres)`);


// ── Plantillas: el hilo debe mostrar lo que el cliente recibió ────────────
// Hasta el 22 sep 2026 los followups salían sin dejar fila en Message: 46
// mensajes eran invisibles en el inbox. Ahora se guardan renderizados, así que
// el texto tiene que coincidir con lo aprobado en la WABA.

const plantillas: Array<[string, string[], string]> = [
  [
    "noshow_recuperacion",
    ["Dario"],
    "¡Hola Dario! 😊 Vimos que no pudiste venir a tu primera sesión. ¿La reagendamos? Tenemos cupos esta semana. Recuerda: entrenas dos semanas por tan solo $9 y aprovechas todo un proceso de evaluación de tu condición física y de salud. ¿Qué día te queda mejor?",
  ],
  [
    "recordatorio_eval_1h",
    ["Vanessa", "La Cueva Xtreme", "6:00 p. m."],
    "¡Hola Vanessa! En una hora es tu primera sesión en La Cueva Xtreme (6:00 p. m.). Llega 15 min antes para tomarte los datos de tu evaluación. ¡Te esperamos! 📍💪",
  ],
];
for (const [name, variables, esperado] of plantillas) {
  const real = renderTemplate({ name, language: "es", variables });
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} renderTemplate(${name})`);
  if (!ok) console.log(`   esperaba: ${esperado}\n   obtuvo:   ${real}`);
}
// Una plantilla que nadie copió aquí no puede inventarse el texto.
const desconocida = renderTemplate({ name: "miembro_inasistencia", language: "es", variables: ["Ana"] });
const okDesc = desconocida.startsWith("[plantilla miembro_inasistencia");
if (!okDesc) fallos++;
console.log(`${okDesc ? "✅" : "❌"} una plantilla sin texto copiado se declara, no se inventa`);



process.exit(fallos + fallosN > 0 ? 1 : 0);
