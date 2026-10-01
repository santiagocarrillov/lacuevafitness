import Link from "next/link";
import type { Sede } from "@/generated/prisma/enums";
import { getBalanceSheet } from "@/lib/actions/finance";
import type { BalanceLine } from "@/lib/finance/ledger";
import { ENTITIES, ENTITY_ORDER, fmtMoney, monthLabel } from "@/lib/finance/entities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OpeningEdit } from "./balance-forms";

const SECTIONS: { type: BalanceLine["type"]; label: string }[] = [
  { type: "ASSET", label: "Activo" },
  { type: "LIABILITY", label: "Pasivo" },
  { type: "EQUITY", label: "Patrimonio" },
];

const day = (d: Date) => d.toISOString().slice(0, 10);
const money = (c: number) => fmtMoney(c, { decimals: true });

export async function BalanceTab({ ym, sede, canEdit }: { ym: string; sede: Sede; canEdit: boolean }) {
  const bs = await getBalanceSheet(sede, ym);
  const href = (s: Sede) => `/dashboard/finanzas?tab=balance&mes=${ym}&entidad=${s}`;
  const lastDay = new Date(bs.until.getTime() - 86_400_000);

  return (
    <div className="space-y-6">
      <div className="flex gap-1">
        {ENTITY_ORDER.map((s) => (
          <Link
            key={s}
            href={href(s)}
            className={`rounded-full border px-3 py-1 text-xs ${s === sede ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
          >
            {ENTITIES[s].name}
          </Link>
        ))}
      </div>

      {!bs.asOf ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {ENTITIES[sede].name} todavía no tiene saldos iniciales cargados.
          {ENTITIES[sede].kind === "PERSONA_NATURAL" && " Como persona natural puede no estar obligada a llevar contabilidad: lo confirma Isabel."}
        </div>
      ) : (
        <>
          <div
            className={`rounded-md border p-4 text-sm ${bs.totals.difference === 0 ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}
          >
            {bs.totals.openingDifference === 0
              ? <>Los saldos iniciales al {day(bs.asOf)} cuadran (activo = pasivo + patrimonio). </>
              : <>⚠️ Los saldos iniciales no cuadran por {money(bs.totals.openingDifference)}. </>}
            {bs.totals.difference === 0
              ? <>El balance al {day(lastDay)} también cuadra.</>
              : <>
                  Al {day(lastDay)} hay una diferencia por cuadrar de <strong>{money(bs.totals.difference)}</strong>: es lo
                  que todavía no está en la app (enero a agosto de QuickBooks, caja, depreciación e intereses del año). Baja a
                  cero a medida que se cargan.
                </>}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="capitalize">Balance · {ENTITIES[sede].legalName} · {monthLabel(ym)}</CardTitle>
              <CardDescription>
                Saldo inicial de los EEFF firmados al {day(bs.asOf)} + lo que la app registra en el año. Nada estimado:
                lo que no tiene datos en la app se queda en su saldo inicial y lo dice.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left font-medium py-2 pr-3">Cuenta</th>
                    <th className="text-right font-medium py-2 px-3 whitespace-nowrap">Saldo inicial</th>
                    <th className="text-right font-medium py-2 px-3 whitespace-nowrap">Movimiento</th>
                    <th className="text-right font-medium py-2 px-3 whitespace-nowrap">Saldo</th>
                    <th className="text-left font-medium py-2 pl-3">Fuente</th>
                  </tr>
                </thead>
                {SECTIONS.map(({ type, label }) => {
                  const rows = bs.lines.filter((l) => l.type === type);
                  const sum = (k: "openingCents" | "closingCents") => rows.reduce((s, l) => s + l[k], 0);
                  return (
                    <tbody key={type}>
                      <tr>
                        <td colSpan={5} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</td>
                      </tr>
                      {rows.map((l) => (
                        <tr key={l.code} className="border-b last:border-0 align-top">
                          <td className="py-1.5 pr-3">
                            <span className="text-xs text-muted-foreground tabular-nums mr-2">{l.code}</span>
                            {l.name}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums whitespace-nowrap">
                            {canEdit && l.openingId ? <OpeningEdit id={l.openingId} cents={l.openingCents} /> : money(l.openingCents)}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                            {l.movementCents === null ? "—" : money(l.movementCents)}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums whitespace-nowrap font-medium">{money(l.closingCents)}</td>
                          <td className="py-1.5 pl-3 text-xs text-muted-foreground">{l.note}</td>
                        </tr>
                      ))}
                      <tr className="border-t font-semibold">
                        <td className="py-1.5 pr-3">Total {label.toLowerCase()}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums">{money(sum("openingCents"))}</td>
                        <td />
                        <td className="py-1.5 px-3 text-right tabular-nums">{money(sum("closingCents"))}</td>
                        <td />
                      </tr>
                    </tbody>
                  );
                })}
              </table>
            </CardContent>
          </Card>

          {bs.loans.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Préstamos de accionistas por persona</CardTitle>
                <CardDescription>
                  Base para la propuesta de aumento de capital por compensación de créditos (asamblea del 29-sep-2026,
                  plazo de 90 días). El desglose inicial por persona llega con el detalle de QuickBooks.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left font-medium py-2 pr-3">Persona</th>
                      <th className="text-right font-medium py-2 px-3">Al {day(bs.asOf)}</th>
                      <th className="text-right font-medium py-2 px-3">Neto del año</th>
                      <th className="text-right font-medium py-2 pl-3">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bs.loans.map((l) => (
                      <tr key={l.person} className="border-b last:border-0">
                        <td className="py-1.5 pr-3">{l.person}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums">{money(l.openingCents)}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums">{money(l.movementCents)}</td>
                        <td className="py-1.5 pl-3 text-right tabular-nums font-medium">{money(l.closingCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
