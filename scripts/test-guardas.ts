/**
 * Prueba de las guardas del bot (src/lib/whatsapp/guards.ts), con los mensajes
 * reales de la conversación de Ibeth del 23 sep 2026.
 *
 * Uso:  npx tsx scripts/test-guardas.ts
 */

import { asksForHuman, isThirdRepeat } from "../src/lib/whatsapp/guards";

let fallos = 0;
function check(nombre: string, ok: boolean) {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
}

// ── Pide una persona ───────────────────────────────────────────────────────
const piden = [
  "Alguien me puede llamar",
  "Necesito hablar con una persona",
  "Me pueden llamar porfa",
  "llámenme al 0999999999",
  "Quiero hablar con un asesor",
  "prefiero una llamada",
  "¿Eres un bot? no eres una persona real",
  "Necesito alguien que me explique",
];
for (const t of piden) check(`pide persona: "${t}"`, asksForHuman([t]));

const noPiden = [
  "Me llamo Ibeth",
  "¿Cómo se llama el gimnasio?",
  "Hola, quiero mis 2 semanas por $9",
  "8 a 9",
  "Si puedo voy hoy para conocer",
  "Mi esposo también quiere ir, ¿es una persona por cupo?",
  "¿Qué pasa si llamo y no contestan?",
];
for (const t of noPiden) check(`NO pide persona: "${t}"`, !asksForHuman([t]));

// ── La misma pregunta por tercera vez ─────────────────────────────────────
const ibeth = [
  "¡Me encanta, Ibeth! 🙌💪 Solo dime dos cositas para dejarte agendada tu primera sesión a las 8:00: ¿la quieres en la mañana o en la tarde? ¿Y prefieres hoy o mañana? Con eso arrancas tus dos semanas ✨",
  "¡Perfecto, Ibeth! 🙌 Entonces te espero HOY. Para dejarte agendada, dime nomás: ¿la 8:00 en la mañana o en la tarde? Así te reservo tu primera sesión y arrancas tus dos semanas 💪✨",
  "¡Tranquila, Ibeth! 😊 No hay apuro. Si quieres venir hoy solo a conocer las instalaciones y que te expliquen todo en persona, también puedes pasar sin problema 🙌\n\nPero si te animas a arrancar tus dos semanas de una, solo dime si te queda mejor la 8:00 de la mañana o la 8:00 de la tarde y te dejo reservada tu primera sesión 💪 ¿Cuál se te acomoda?",
  "¡No te preocupes, Ibeth! 😊 Hoy quedó justo. ¿Te parece si te reservo para mañana? Dime si la 8:00 te queda mejor en la mañana o en la tarde y te dejo lista tu primera sesión para arrancar tus dos semanas 💪✨",
  "¡Perfecto, Ibeth! 🙌 Pero necesito una cosita más para dejarte reservada: ¿la 8:00 te queda mejor en la mañana o en la tarde? Con eso te dejo lista tu primera sesión de mañana en La Cueva Xtreme 💪✨",
];
// El 3º (08:07:14) mezcla la pregunta con "si quieres ven solo a conocer", así
// que se parece solo a medias al 1º; el 4º (08:07:28) ya es inequívoco. Con esto
// Ibeth habría tenido una persona a las 08:07 en vez de a las 10:23.
check("Ibeth: el 4º '¿la 8:00 mañana o tarde?' se detecta", isThirdRepeat(ibeth[3], ibeth.slice(1, 3)));
check("Ibeth: el 5º también", isThirdRepeat(ibeth[4], ibeth.slice(2, 4)));
check("Ibeth: el 2º todavía no (solo hay un mensaje antes)", !isThirdRepeat(ibeth[1], ibeth.slice(0, 1)));

// Una conversación normal que avanza no dispara.
const normal = [
  "¡Hola, Vero! 🙌 ¿En qué sector de Sangolquí vives, para decirte qué sede te queda mejor?",
  "¡Chévere! Entonces te queda Fitness Center 📍 ¿Te acomoda más en la mañana o en la tarde?",
];
check("normal: pasar a pedir el día NO es repetir",
  !isThirdRepeat("¡Perfecto! ¿Para hoy o para mañana a las 6:30 pm? Así arrancas tus dos semanas 💪", normal));
check("normal: confirmar la cita (sin pregunta) NO es repetir",
  !isThirdRepeat("¡Listo, Vero! Te espero mañana a las 6:30 pm en Fitness Center. Llega 15 min antes 🙌", normal));

console.log(fallos ? `\n❌ ${fallos} fallo(s)` : "\n✅ Todo correcto (guardas del bot)");
process.exit(fallos ? 1 : 0);
