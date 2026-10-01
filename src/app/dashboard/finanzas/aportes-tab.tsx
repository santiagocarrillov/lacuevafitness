import { ecuadorDateString } from "@/lib/timezone";
import { listCapitalMovements } from "@/lib/actions/finance";
import { CAPITAL_KIND_LABELS, CAPITAL_SIGN, ENTITIES, fmtMoney, monthLabel } from "@/lib/finance/entities";
import { CapitalDialog, VoidButton } from "./forms";

export async function AportesTab({ ym, canEdit }: { ym: string; canEdit: boolean }) {
  const rows = await listCapitalMovements(ym);
  const net = rows
    .filter((r) => !r.voidedAt)
    .reduce((s, r) => s + CAPITAL_SIGN[r.kind] * r.amountCents, 0);
  const defaultDate = ym === ecuadorDateString().slice(0, 7) ? undefined : `${ym}-01`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">
          <span className="capitalize">{monthLabel(ym)}</span>: neto de los dueños {fmtMoney(net, { decimals: true })}.
          En la S.A.S., lo que pones queda como préstamo del accionista (la empresa te lo debe) o como aporte para
          futura capitalización. Así queda documentado frente al otro socio.
        </p>
        {canEdit && <CapitalDialog defaultDate={defaultDate} />}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay aportes ni préstamos registrados en este mes.
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left font-medium px-3 py-2">Fecha</th>
                <th className="text-left font-medium px-3 py-2">Entidad</th>
                <th className="text-left font-medium px-3 py-2">Persona</th>
                <th className="text-left font-medium px-3 py-2">Tipo</th>
                <th className="text-right font-medium px-3 py-2">Monto</th>
                <th className="text-left font-medium px-3 py-2">Notas</th>
                {canEdit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b last:border-0 ${r.voidedAt ? "text-muted-foreground line-through" : ""}`}>
                  <td className="px-3 py-2 whitespace-nowrap">{r.date.toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{ENTITIES[r.sede].name.replace("La Cueva ", "")}</td>
                  <td className="px-3 py-2">{r.person}</td>
                  <td className="px-3 py-2">{CAPITAL_KIND_LABELS[r.kind]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoney(CAPITAL_SIGN[r.kind] * r.amountCents, { decimals: true })}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.notes}</td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">{!r.voidedAt && <VoidButton id={r.id} kind="capital" />}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
