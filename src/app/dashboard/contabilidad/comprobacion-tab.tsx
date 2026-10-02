import type { Sede } from "@/generated/prisma/enums";
import { getTrialBalance } from "@/lib/actions/accounting";
import { Indent, money } from "./shared";

export async function ComprobacionTab({ sede, from, to }: { sede: Sede; from: string; to: string }) {
  const rows = await getTrialBalance(sede, from, to);
  const detail = rows.filter((r) => r.postable);
  const debit = detail.reduce((s, r) => s + r.debitCents, 0);
  const credit = detail.reduce((s, r) => s + r.creditCents, 0);
  const visible = rows.filter((r) => r.openingCents !== 0 || r.debitCents !== 0 || r.creditCents !== 0 || r.closingCents !== 0);

  return (
    <div className="space-y-3">
      <p className={`text-sm ${debit === credit ? "text-emerald-700" : "text-red-700"}`}>
        Movimientos del {from} al {to}: debe {money(debit)} · haber {money(credit)} {debit === credit ? "· cuadra" : "· ⚠️ no cuadra"}
      </p>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left font-medium px-3 py-2">Cuenta</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">Saldo inicial</th>
              <th className="text-right font-medium px-3 py-2">Debe</th>
              <th className="text-right font-medium px-3 py-2">Haber</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">Saldo final</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className={`border-b last:border-0 ${!r.postable ? "bg-muted/20" : ""}`}>
                <td className="px-3 py-1.5">
                  <Indent depth={r.depth} bold={!r.postable}>
                    <span className="text-xs text-muted-foreground tabular-nums mr-2">{r.code}</span>
                    {r.name}
                  </Indent>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(r.openingCents)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(r.debitCents)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(r.creditCents)}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${!r.postable ? "font-semibold" : "font-medium"}`}>{money(r.closingCents)}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-3 text-center text-muted-foreground">Sin saldos ni movimientos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Saldos en su lado natural: deudor para activos y gastos, acreedor para pasivos, patrimonio e ingresos.</p>
    </div>
  );
}
