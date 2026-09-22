/**
 * Prueba del alta de socio: que el estado lo decida el plan.
 *
 * El 22 sep 2026 había cinco personas marcadas como socios activos cuya única
 * membresía eran las dos semanas de $9. `assignMembership` ponía ACTIVE sin
 * mirar el plan, y el KPI de socios activos los contaba. Esto fija la tabla.
 *
 * Uso:  npx tsx scripts/test-alta-socio.ts
 */

import "dotenv/config";
import { foldName, leadStageForMemberStatus, memberStatusForPlan } from "../src/lib/member-lifecycle";
import type { BillingCycle, MemberStatus } from "../src/generated/prisma/client";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: string) {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
  if (!ok && detalle) console.log(`   ${detalle}`);
}

// ── El plan decide el estado ───────────────────────────────────────────────
const planes: Array<[BillingCycle, MemberStatus | null, string]> = [
  ["TRIAL", "TRIAL", "las 2 semanas de $9 son evaluación, NO una venta"],
  ["MONTHLY", "ACTIVE", "mensualidad = socio activo"],
  ["QUARTERLY", "ACTIVE", "trimestral = socio activo"],
  ["SEMIANNUAL", "ACTIVE", "semestral = socio activo"],
  ["ANNUAL", "ACTIVE", "anual = socio activo"],
  ["ONE_TIME", null, "pase diario NO promueve: quien cae un día suelto no es socio"],
];
for (const [cycle, esperado, porque] of planes) {
  const real = memberStatusForPlan(cycle);
  check(`${cycle.padEnd(11)} → ${String(esperado).padEnd(6)} · ${porque}`, real === esperado,
    `esperaba ${esperado}, obtuvo ${real}`);
}

// ── El estado decide la etapa del embudo ──────────────────────────────────
const etapas: Array<[MemberStatus, string | null]> = [
  ["TRIAL", "TRIAL_ATTENDED"],
  ["ACTIVE", "CONVERTED"],
  ["PAUSED", null],
  ["CHURNED", null],
  ["LEAD", null],
];
for (const [status, esperado] of etapas) {
  const real = leadStageForMemberStatus(status);
  check(`socio ${status.padEnd(8)} → embudo ${String(esperado)}`, real === esperado,
    `esperaba ${esperado}, obtuvo ${real}`);
}

// El caso que motivó todo: comprar el trial NO puede dar "Socio activo".
const trialStatus = memberStatusForPlan("TRIAL")!;
check(
  'comprar el trial de $9 nunca termina en CONVERTED ("Socio activo")',
  leadStageForMemberStatus(trialStatus) !== "CONVERTED",
);
// Y una mensualidad real sí convierte: es la tasa que hay que medir.
check(
  "pagar mensualidad sí convierte (evaluación → activo)",
  leadStageForMemberStatus(memberStatusForPlan("MONTHLY")!) === "CONVERTED",
);

// ── Atar socio ↔ lead: teléfono Y nombre ──────────────────────────────────
// Los celulares se comparten en familia. El 0984505143 está en la ficha de
// socio de Santiago Carrillo Y en el lead de Emilia Carrillo: atar por número
// habría fusionado a dos personas. Un vínculo que falta se arregla a mano; uno
// equivocado corrompe el historial de dos personas y nadie se entera.
const nombres: Array<[string, string, boolean, string]> = [
  ["Santiago", "Emilia", false, "mismo teléfono de familia, personas distintas"],
  ["Jose Luis", "Jose Luis", true, "misma persona"],
  ["Jose Luis", "Jose", true, "se compara solo el primer nombre"],
  ["Veronica", "Verito", false, "diminutivo: no se arriesga, se ata a mano"],
  ["José", "Jose", true, "la tilde no separa a nadie"],
  ["MARÍA", "maria", true, "mayúsculas tampoco"],
];
for (const [a, b, esperado, porque] of nombres) {
  const ok = (foldName(a) === foldName(b)) === esperado;
  check(`"${a}" vs "${b}" → ${esperado ? "ata" : "NO ata"} · ${porque}`, ok,
    `foldName("${a}")="${foldName(a)}" foldName("${b}")="${foldName(b)}"`);
}

console.log(fallos === 0 ? "\n✅ Todo correcto (alta de socio)" : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
