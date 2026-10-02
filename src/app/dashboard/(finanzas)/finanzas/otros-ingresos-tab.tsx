import Link from "next/link";
import { listOtherIncome } from "@/lib/actions/finance";
import { ENTITIES, OTHER_INCOME_LABELS, fmtMoney, monthLabel } from "@/lib/finance/entities";
import { VoidButton } from "./forms";

export async function OtrosIngresosTab({ ym, canEdit }: { ym: string; canEdit: boolean }) {
  const rows = await listOtherIncome(ym);
  const total = rows.filter((r) => !r.voidedAt).reduce((s, r) => s + r.amountCents, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="capitalize">{monthLabel(ym)}</span>: {fmtMoney(total, { decimals: true })} en ingresos que no son
          membresías. Las membresías se registran en Pagos.
        </p>
        {canEdit && <Link href={`/dashboard/finanzas/otros-ingresos/nuevo?mes=${ym}`} className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">+ Registrar ingreso</Link>}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay otros ingresos en este mes.
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left font-medium px-3 py-2">Fecha</th>
                <th className="text-left font-medium px-3 py-2">Entidad</th>
                <th className="text-left font-medium px-3 py-2">Categoría</th>
                <th className="text-left font-medium px-3 py-2">Descripción</th>
                <th className="text-right font-medium px-3 py-2">Monto</th>
                {canEdit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b last:border-0 ${r.voidedAt ? "text-muted-foreground line-through" : ""}`}>
                  <td className="px-3 py-2 whitespace-nowrap">{r.date.toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{ENTITIES[r.sede].name.replace("La Cueva ", "")}</td>
                  <td className="px-3 py-2">{OTHER_INCOME_LABELS[r.category]}</td>
                  <td className="px-3 py-2">{r.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.amountCents, { decimals: true })}</td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">{!r.voidedAt && <VoidButton id={r.id} kind="other" />}</td>
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
