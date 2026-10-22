/**
 * Prueba de cómo se arma el wa_id desde el celular de la ficha.
 * Tiene que coincidir con el número que manda Meta cuando la persona contesta
 * (593 + 9 dígitos); si no, la respuesta no encuentra su conversación.
 *
 * Uso:  npx tsx scripts/test-wa-id.ts
 */

import { waIdFromPhone } from "../src/lib/whatsapp/contact";
import { waLink } from "../src/components/ficha/layout";

let fallos = 0;
function check(nombre: string, got: string | null | undefined, want: string | null | undefined) {
  const ok = got === want;
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
  if (!ok) console.log(`   esperado: ${want}\n   obtenido: ${got}`);
}

check("09… local", waIdFromPhone("0994305822"), "593994305822");
check("+593 bien escrito", waIdFromPhone("+593 99 430 5822"), "593994305822");
check("593 sin signo", waIdFromPhone("593994305822"), "593994305822");
check("+593 con el 0 local (caso Jenth)", waIdFromPhone("+5930994305822"), "593994305822");
check("solo 9 dígitos", waIdFromPhone("994305822"), "593994305822");
check("sin celular", waIdFromPhone(null), null);
check("muy corto", waIdFromPhone("22345"), null);

check("wa.me con el 0 local", waLink("+5930994305822"), "https://wa.me/593994305822");
check("wa.me 09…", waLink("0994305822"), "https://wa.me/593994305822");
check("wa.me extranjero se respeta", waLink("+1 305 555 0101"), "https://wa.me/13055550101");

console.log(fallos ? `\n❌ ${fallos} fallo(s)` : "\n✅ Todo correcto (wa_id)");
process.exit(fallos ? 1 : 0);
