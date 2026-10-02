import type { Sede } from "@/generated/prisma/enums";
import { getStatements } from "@/lib/actions/accounting";
import type { TreeRow } from "@/lib/accounting/reports";
import { ENTITIES, monthLabel } from "@/lib/finance/entities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Indent, money } from "./shared";
import { mayorHref } from "./links";

function Rows({ rows, maxDepth = 3, sede, desde, hasta }: { rows: TreeRow[]; maxDepth?: number; sede: Sede; desde: string; hasta: string }) {
  return (
    <>
      {rows
        .filter((r) => r.depth <= maxDepth && (r.depth === 0 || r.closingCents !== 0))
        .map((r) => (
          <tr key={r.id} className={r.depth === 0 ? "border-t font-semibold" : ""}>
            <td className="py-1 pr-3">
              <Indent depth={r.depth} bold={!r.postable}>
                <span className="text-xs text-muted-foreground tabular-nums mr-2">{r.code}</span>
                {r.postable ? (
                  <Link href={mayorHref(sede, r.id, desde, hasta)} className="hover:underline">{r.name}</Link>
                ) : (
                  r.name
                )}
              </Indent>
            </td>
            <td className={`py-1 pl-3 text-right tabular-nums whitespace-nowrap ${!r.postable ? "font-semibold" : ""}`}>
              {r.postable ? (
                <Link href={mayorHref(sede, r.id, desde, hasta)} className="hover:underline" title="Ver el mayor de la cuenta">
                  {money(r.closingCents)}
                </Link>
              ) : (
                money(r.closingCents)
              )}
            </td>
          </tr>
        ))}
    </>
  );
}

export async function EstadosTab({ sede, asOf, ym }: { sede: Sede; asOf: string; ym: string }) {
  const s = await getStatements(sede, asOf);
  const section = (type: TreeRow["type"]) => s.balance.filter((r) => r.type === type);
  const range = { sede, desde: `${asOf.slice(0, 4)}-01-01`, hasta: asOf };

  return (
    <div className="space-y-6">
      <div className={`rounded-md border p-3 text-sm ${s.totals.check === 0 ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"}`}>
        {s.totals.check === 0
          ? "Cuadra: activo = pasivo + patrimonio (sale del libro diario, por construcción)."
          : `⚠️ Descuadre de ${money(s.totals.check)}: revisa el balance de comprobación.`}{" "}
        Cobros, gastos, aportes y banco se contabilizan solos; los gastos de enero a agosto que faltan se cargan con los
        archivos de la contabilidad anterior.
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Estado de situación financiera</CardTitle>
            <CardDescription>{ENTITIES[sede].legalName} · al {asOf}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                <Rows rows={section("ASSET")} {...range} />
                <Rows rows={section("LIABILITY")} {...range} />
                <Rows rows={section("EQUITY")} {...range} />
                <tr>
                  <td className="py-1 pr-3"><Indent depth={1}>Resultado del ejercicio {asOf.slice(0, 4)} <span className="text-xs text-muted-foreground">(detalle en el estado de resultados)</span></Indent></td>
                  <td className="py-1 pl-3 text-right tabular-nums">{money(s.resultCents)}</td>
                </tr>
                <tr className="border-t-2 font-semibold">
                  <td className="py-1.5 pr-3">Total pasivo + patrimonio</td>
                  <td className="py-1.5 pl-3 text-right tabular-nums">{money(s.totals.liabilities + s.totals.equity)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Estado de resultados</CardTitle>
              <CardDescription className="capitalize">Del 1 de enero al cierre de {monthLabel(ym)}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  <Rows rows={s.income.filter((r) => r.type === "INCOME")} {...range} />
                  <Rows rows={s.income.filter((r) => r.type === "EXPENSE")} {...range} />
                  <tr className="border-t-2 font-semibold">
                    <td className="py-1.5 pr-3">Resultado del ejercicio</td>
                    <td className={`py-1.5 pl-3 text-right tabular-nums ${s.resultCents < 0 ? "text-red-700" : s.resultCents > 0 ? "text-emerald-700" : ""}`}>
                      {money(s.resultCents)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          {s.loans.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Préstamos de accionistas por persona</CardTitle>
                <CardDescription>
                  Del libro diario (tercero de cada línea). Base de la propuesta de capitalización (asamblea del 29-sep-2026).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <tbody>
                    {s.loans.map((l) => (
                      <tr key={l.party} className="border-b last:border-0">
                        <td className="py-1.5">{l.party}</td>
                        <td className="py-1.5 text-right tabular-nums font-medium">{money(l.balanceCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
