/**
 * SRXFIT › Evaluaciones — el grupo como un solo socio + alertas por dos ciclos sin datos.
 *  A. Tendencias (puro): mejoró / igual / peor con el signo de cada test.
 *  B. Composición corporal y mensajes "en qué estamos fallando".
 *  C. Producción (solo lectura) + simulación de las tareas de las 5:00 (dryRun: no crea ni avisa).
 *
 * Uso:  npx tsx --env-file=.env scripts/test-evaluaciones-grupo.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { blockOf, bodyTrend, groupEvaluationStats, insightsFor, trendFor } from "../src/lib/srxfit/group-stats";
import { generateAutoTasks } from "../src/lib/tasks/auto";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const d = (s: string) => new Date(`${s}T12:00:00Z`);

function partA() {
  console.log("\n── A. Tendencias");
  const bench = trendFor("BENCH_PRESS_3RM", [
    [{ at: d("2026-06-01"), value: 40 }, { at: d("2026-08-01"), value: 45 }], // +12.5%
    [{ at: d("2026-06-01"), value: 50 }, { at: d("2026-08-01"), value: 50.3 }], // +0.6% → igual
    [{ at: d("2026-06-01"), value: 60 }, { at: d("2026-08-01"), value: 55 }], // −8.3%
    [{ at: d("2026-06-01"), value: 30 }], // una sola medición: no cuenta
    [{ at: d("2026-06-01"), value: 30 }, { at: d("2026-06-10"), value: 40 }], // menos de 3 semanas: no cuenta
  ]);
  check("3 comparables: 1 mejoró, 1 igual, 1 peor", bench.n === 3 && bench.improved === 1 && bench.same === 1 && bench.worse === 1, JSON.stringify(bench));
  check("cambio típico (mediana) = +0.6%", bench.avgChangePct === 0.6, String(bench.avgChangePct));
  const typo = trendFor("PLANK_SECONDS", [
    [{ at: d("2026-06-01"), value: 60 }, { at: d("2026-08-01"), value: 66 }],
    [{ at: d("2026-06-01"), value: 60 }, { at: d("2026-08-01"), value: 63 }],
    [{ at: d("2026-06-01"), value: 1 }, { at: d("2026-08-01"), value: 70 }], // 1 minuto escrito como 1 s
  ]);
  check("un dato mal escrito no mueve el cambio típico", typo.avgChangePct === 10, String(typo.avgChangePct));
  const christine = trendFor("CHRISTINE_TIME_SECONDS", [[{ at: d("2026-06-01"), value: 600 }, { at: d("2026-08-01"), value: 540 }]]);
  check("Christine: bajar el tiempo es mejorar (+10%)", christine.improved === 1 && christine.avgChangePct === 10, String(christine.avgChangePct));
  check("bloques: antes de SRXFIT = 0, 4 may = 1, 7 sep = 3", blockOf(d("2026-04-01")) === 0 && blockOf(d("2026-05-04")) === 1 && blockOf(d("2026-09-07")) === 3);
}

function partB() {
  console.log("\n── B. Composición y mensajes");
  const body = bodyTrend([
    [{ at: d("2026-06-01"), weightKg: 80, bodyFatPct: 30 }, { at: d("2026-08-01"), weightKg: 78, bodyFatPct: 27 }],
    [{ at: d("2026-06-01"), weightKg: 60, bodyFatPct: 25 }, { at: d("2026-08-01"), weightKg: 61, bodyFatPct: 26 }],
  ]);
  check("peso −0.5 kg y grasa −1 punto en promedio", body.weightChangeKg === -0.5 && body.fatChangePts === -1, JSON.stringify(body));
  check("1 perdió grasa: 24 → 21.06 kg = 2.9 kg", body.lostFat === 1 && body.fatKgLost === 2.9, String(body.fatKgLost));
  const none = trendFor("BENCH_PRESS_3RM", Array.from({ length: 6 }, () => [{ at: d("2026-06-01"), value: 50 }, { at: d("2026-08-01"), value: 49 }]));
  const ins = insightsFor({ tests: [none], body: { n: 6, weightChangeKg: 1, fatChangePts: 0.4, lostFat: 0, fatKgLost: 0 }, population: 100, evaluatedThisCycle: 30, gaps: 12 });
  const text = ins.map((i) => i.text).join(" | ");
  check("avisa: nadie mejoró press banca", /Nadie ha mejorado Press banca/.test(text), text);
  check("avisa: el grupo no bajó grasa", /no han bajado % de grasa/.test(text));
  check("avisa: 30% con datos y 12 sin datos en dos ciclos", /Solo 30%/.test(text) && /12 socios/.test(text));
}

async function partC() {
  console.log("\n── C. Producción (solo lectura)");
  const s = await groupEvaluationStats();
  check("se calcula", s.population > 0, `${s.population} socios que pagan · ${s.evaluatedThisCycle} con datos este ciclo · ${s.gaps.length} sin datos en 2 ciclos`);
  for (const t of s.tests.slice(0, 6)) console.log(`   · ${t.label}: n=${t.n} mejoraron ${t.improved} · prom ${t.avgChangePct}%`);
  console.log(`   · Composición: n=${s.body.n} peso ${s.body.weightChangeKg} kg · grasa ${s.body.fatChangePts} pts · ${s.body.fatKgLost} kg perdidos`);
  for (const i of s.insights) console.log(`   ${i.level === "good" ? "🟢" : i.level === "warn" ? "🟡" : "🔴"} ${i.text}`);
  check("bloques en orden", s.blocks.every((b, i) => i === 0 || s.blocks[i - 1].block < b.block), s.blocks.map((b) => `${b.label}:${b.n}`).join(" "));
  const before = await prisma.staffTask.count();
  const sim = await generateAutoTasks({ dryRun: true });
  check("simulación de las 5:00 no crea nada", (await prisma.staffTask.count()) === before, `planea ${sim.byReason["evaluación SRXFIT"] ?? 0} tareas «Evaluar a…» nuevas`);
  check("como mucho 10 por sede", Object.values(sim.plans.filter((p) => p.reason === "evaluación SRXFIT").reduce((a, p) => ({ ...a, [p.sede]: (a[p.sede] ?? 0) + 1 }), {} as Record<string, number>)).every((n) => n <= 10));
}

(async () => {
  partA();
  partB();
  await partC();
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
})();
