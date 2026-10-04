import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleAlert, Scale, UserX, Users } from "lucide-react";
import type { GroupStats } from "@/lib/srxfit/group-stats";
import { BlockChart } from "./block-chart";
import { SendTestsNoticeButton } from "./send-tests-notice";

const SEDE: Record<string, string> = { FITNESS_CENTER: "Fitness", XTREME: "Xtreme" };

function Tile({ label, value, sub, icon: Icon, color, href }: { label: string; value: string; sub?: string; icon: typeof Users; color: string; href?: string }) {
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}14`, color }}><Icon className="size-5" /></span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </>
  );
  const cls = "flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4";
  return href ? <Link href={href} className={`${cls} hover:border-stone-400`}>{body}</Link> : <div className={cls}>{body}</div>;
}

const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

export function GroupDashboard({ s }: { s: GroupStats }) {
  const cov = s.population ? Math.round((s.evaluatedThisCycle / s.population) * 100) : 0;
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">El grupo como un solo socio</h2>
        <p className="text-sm text-muted-foreground">Socios activos que pagan, con datos oficiales (tomados por el staff o verificados). Primera medición contra la última de cada uno.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Socios que pagan" value={String(s.population)} sub="Sin personal ni trials" icon={Users} color="#3a8fd1" />
        <Tile label="Con datos este ciclo" value={`${cov}%`} sub={`${s.evaluatedThisCycle} de ${s.population} en las últimas 9 semanas`} icon={CheckCircle2} color={cov >= 90 ? "#2f855a" : cov >= 60 ? "#d97e0a" : "#e5533f"} />
        <Tile label="Sin datos en 2 ciclos" value={String(s.gaps.length)} sub="Pagan y asisten: hay que evaluarlos" icon={UserX} color={s.gaps.length ? "#e5533f" : "#2f855a"} href="#sin-datos" />
        <Tile label="Grasa perdida" value={`${s.body.fatKgLost} kg`} sub={`${s.body.lostFat} de ${s.body.n} socios comparables`} icon={Scale} color="#0f9f8f" />
      </div>

      {s.insights.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-600">En qué estamos fallando (y qué va bien)</h3>
          <ul className="space-y-1.5 text-sm">
            {s.insights.map((i, k) => (
              <li key={k} className="flex gap-2">
                {i.level === "good" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : i.level === "warn" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />}
                {i.href ? <a href={i.href} className="hover:underline">{i.text}</a> : <span>{i.text}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white lg:col-span-3">
          <h3 className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wider text-stone-600">Tests: ¿el grupo mejora?</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Test</th>
                <th className="px-2 py-2 font-medium">Mejoraron · igual · peor</th>
                <th className="px-2 py-2 text-right font-medium">Cambio típico</th>
                <th className="hidden px-4 py-2 text-right font-medium md:table-cell">Inicio → hoy</th>
              </tr>
            </thead>
            <tbody>
              {s.tests.map((t) => {
                const w = (x: number) => `${t.n ? (x / t.n) * 100 : 0}%`;
                return (
                  <tr key={t.test} className="border-t">
                    <td className="px-4 py-2">
                      <span className="font-medium">{t.label}</span>
                      <span className="block text-xs text-muted-foreground">{t.n} socios</span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex h-2.5 w-full min-w-28 overflow-hidden rounded-full bg-stone-100">
                        <div className="bg-emerald-500" style={{ width: w(t.improved) }} />
                        <div className="bg-stone-300" style={{ width: w(t.same) }} />
                        <div className="bg-red-400" style={{ width: w(t.worse) }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{t.improved} · {t.same} · {t.worse}</span>
                    </td>
                    <td className={`px-2 py-2 text-right font-semibold tabular-nums ${t.avgChangePct > 0 ? "text-emerald-700" : t.avgChangePct < 0 ? "text-red-700" : ""}`}>{sign(t.avgChangePct)}%</td>
                    <td className="hidden px-4 py-2 text-right tabular-nums text-muted-foreground md:table-cell">{t.avgBaseline} → {t.avgLatest} {t.unit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">En tiempos y ángulo (Christine, remo, ring row) bajar es mejorar; ya viene con el signo corregido. Cambios de ±1% cuentan como igual. Cambio típico = mediana, para que un dato mal escrito no mueva al grupo.</p>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-600">Composición corporal</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className={`text-2xl font-semibold tabular-nums ${s.body.weightChangeKg < 0 ? "text-emerald-700" : ""}`}>{sign(s.body.weightChangeKg)} kg</p><p className="text-xs text-muted-foreground">peso promedio</p></div>
              <div><p className={`text-2xl font-semibold tabular-nums ${s.body.fatChangePts < 0 ? "text-emerald-700" : "text-red-700"}`}>{sign(s.body.fatChangePts)} pts</p><p className="text-xs text-muted-foreground">% de grasa promedio</p></div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{s.body.n} socios con dos mediciones separadas por 3 semanas o más.</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-600">Promedio del grupo por bloque</h3>
            <BlockChart rows={s.blocks} />
          </div>
        </div>
      </div>

      <div id="sin-datos" className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <h3 className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wider text-stone-600">Pagan y asisten, sin datos en dos ciclos · {s.gaps.length}</h3>
        {s.gaps.length > 0 && <p className="border-b bg-stone-50 px-4 py-2 text-xs text-muted-foreground">Cada uno tiene su tarea «Evaluar a…» en la sede. Si intentaron y no se pudo, mándale el WhatsApp «Faltan tus tests».</p>}
        {s.gaps.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Todos los que pagan y asisten tienen datos recientes.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {s.gaps.map((g) => (
                <tr key={g.memberId} className="border-t first:border-0">
                  <td className="px-4 py-2"><Link href={`/dashboard/srxfit/evaluaciones/${g.memberId}`} className="font-medium hover:underline">{g.name}</Link></td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{SEDE[g.sede]}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{g.lastDataAt ? `Último dato: ${g.lastDataAt.toISOString().slice(0, 10)}` : "Nunca evaluado"}</td>
                  <td className="px-2 py-2 text-right text-xs text-muted-foreground">{g.visits30} visitas en 30 días</td>
                  <td className="px-4 py-2 text-right"><SendTestsNoticeButton memberId={g.memberId} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
