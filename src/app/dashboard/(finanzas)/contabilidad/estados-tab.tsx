import type { Sede } from "@/generated/prisma/enums";
import { getStatements } from "@/lib/actions/accounting";
import type { TreeRow } from "@/lib/accounting/reports";
import { ENTITIES, ENTITY_ORDER, monthLabel } from "@/lib/finance/entities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Indent, money } from "./shared";
import { mayorHref } from "./links";

type Statements = Awaited<ReturnType<typeof getStatements>>;

/**
 * Both entities summed account by account (same chart codes). Accounts that
 * share a code but not a name (each one's banks, equity) stay on their own
 * rows. No intercompany eliminations: the two companies don't trade with each
 * other today.
 */
async function consolidated(asOf: string): Promise<Statements> {
  const all = await Promise.all(ENTITY_ORDER.map((s) => getStatements(s, asOf)));
  const merge = (pick: (s: Statements) => TreeRow[]) => {
    const m = new Map<string, TreeRow>();
    for (const st of all)
      for (const r of pick(st)) {
        const k = `${r.code}|${r.postable ? r.name : ""}`;
        const cur = m.get(k);
        if (!cur) m.set(k, { ...r, id: k });
        else {
          cur.openingCents += r.openingCents;
          cur.debitCents += r.debitCents;
          cur.creditCents += r.creditCents;
          cur.closingCents += r.closingCents;
        }
      }
    return [...m.values()].sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }) || a.name.localeCompare(b.name));
  };
  const add = (f: (s: Statements) => number) => all.reduce((a, s) => a + f(s), 0);
  return {
    ...all[0],
    balance: merge((s) => s.balance),
    income: merge((s) => s.income),
    resultCents: add((s) => s.resultCents),
    totals: {
      assets: add((s) => s.totals.assets),
      liabilities: add((s) => s.totals.liabilities),
      equity: add((s) => s.totals.equity),
      check: add((s) => s.totals.check),
    },
    loans: all.flatMap((s, i) => s.loans.map((l) => ({ ...l, party: `${l.party} · ${ENTITIES[ENTITY_ORDER[i]].name}` }))),
  };
}

function Rows({ rows, maxDepth = 3, sede, desde, hasta }: { rows: TreeRow[]; maxDepth?: number; sede: Sede | null; desde: string; hasta: string }) {
  return (
    <>
      {rows
        .filter((r) => r.depth <= maxDepth && (r.depth === 0 || r.closingCents !== 0))
        .map((r) => (
          <tr key={r.id} className={r.depth === 0 ? "border-t font-semibold" : ""}>
            <td className="py-1 pr-3">
              <Indent depth={r.depth} bold={!r.postable}>
                <span className="text-xs text-muted-foreground tabular-nums mr-2">{r.code}</span>
                {r.postable && sede ? (
                  <Link href={mayorHref(sede, r.id, desde, hasta)} className="hover:underline">{r.name}</Link>
                ) : (
                  r.name
                )}
              </Indent>
            </td>
            <td className={`py-1 pl-3 text-right tabular-nums whitespace-nowrap ${!r.postable ? "font-semibold" : ""}`}>
              {r.postable && sede ? (
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

/** `sede` null = consolidated (figures don't drill down: open one company for that). */
export async function EstadosTab({ sede, asOf, ym }: { sede: Sede | null; asOf: string; ym: string }) {
  const s = sede ? await getStatements(sede, asOf) : await consolidated(asOf);
  const who = sede ? ENTITIES[sede].legalName : `Consolidado · ${ENTITY_ORDER.map((x) => ENTITIES[x].name).join(" + ")}`;
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
            <CardDescription>{who} · al {asOf}</CardDescription>
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
              <CardDescription className="first-letter:uppercase">Del 1 de enero al cierre de {monthLabel(ym)}</CardDescription>
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
