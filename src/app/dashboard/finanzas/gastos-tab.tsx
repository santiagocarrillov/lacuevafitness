import Link from "next/link";
import { ecuadorDateString } from "@/lib/timezone";
import { listExpenses, listPayables } from "@/lib/actions/finance";
import {
  DOC_TYPE_LABELS,
  ENTITIES,
  EXPENSE_CATEGORY_LABELS,
  PAY_METHOD_LABELS,
  fmtMoney,
  isDeductible,
  monthLabel,
} from "@/lib/finance/entities";
import { ExpenseActions, ExpenseDialog } from "./forms";
import { CategorySelect, SriImportDialog } from "./sri-forms";

function day(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "—";
}

type Row = Awaited<ReturnType<typeof listExpenses>>[number];

function ExpenseTable({ rows, canEdit }: { rows: Row[]; canEdit: boolean }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="text-left font-medium px-3 py-2">Fecha</th>
            <th className="text-left font-medium px-3 py-2">Entidad</th>
            <th className="text-left font-medium px-3 py-2">Descripción</th>
            <th className="text-left font-medium px-3 py-2">Categoría</th>
            <th className="text-left font-medium px-3 py-2">Documento</th>
            <th className="text-right font-medium px-3 py-2">Total</th>
            <th className="text-left font-medium px-3 py-2">Pago</th>
            {canEdit && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const voided = !!e.voidedAt;
            return (
              <tr key={e.id} className={`border-b last:border-0 ${voided ? "text-muted-foreground line-through" : ""}`}>
                <td className="px-3 py-2 whitespace-nowrap">{day(e.date)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{ENTITIES[e.sede].name.replace("La Cueva ", "")}</td>
                <td className="px-3 py-2">
                  {e.description}
                  {e.supplierName && <span className="block text-xs text-muted-foreground">{e.supplierName}</span>}
                  {voided && e.voidReason && (
                    <span className="block text-xs no-underline">Anulado: {e.voidReason}</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {canEdit && !voided ? (
                    <CategorySelect id={e.id} value={e.category} flagged={e.notes === "Categoría por revisar"} />
                  ) : (
                    EXPENSE_CATEGORY_LABELS[e.category]
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {DOC_TYPE_LABELS[e.documentType]}
                  {e.sriAccessKey && <span className="ml-1 rounded bg-sky-50 px-1 text-[10px] text-sky-800">SRI</span>}
                  {e.documentNumber && <span className="block text-xs text-muted-foreground">{e.documentNumber}</span>}
                  {isDeductible(e) && <span className="block text-[11px] text-emerald-700">deducible</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                  {fmtMoney(e.amountCents, { decimals: true })}
                  {e.ivaCents ? (
                    <span className="block text-xs text-muted-foreground">IVA {fmtMoney(e.ivaCents, { decimals: true })}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {e.status === "PENDING" ? (
                    <span className="text-amber-700">
                      Por pagar{e.dueDate && <span className="block text-xs">vence {day(e.dueDate)}</span>}
                    </span>
                  ) : (
                    <>
                      {e.paymentMethod ? PAY_METHOD_LABELS[e.paymentMethod] : "Pagado"}
                      {e.bankTransactionId && <span className="block text-xs text-emerald-700">en banco</span>}
                    </>
                  )}
                </td>
                {canEdit && (
                  <td className="px-3 py-2">
                    {!voided && (
                      <ExpenseActions
                        id={e.id}
                        hasReceipt={!!e.receiptPath}
                        pendingPayment={e.status === "PENDING"}
                      />
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export async function GastosTab({ ym, canEdit }: { ym: string; canEdit: boolean }) {
  const [rows, payables] = await Promise.all([listExpenses(ym), listPayables()]);
  const active = rows.filter((r) => !r.voidedAt);
  const total = active.reduce((s, r) => s + r.amountCents, 0);
  const defaultDate = ym === ecuadorDateString().slice(0, 7) ? undefined : `${ym}-01`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="capitalize">{monthLabel(ym)}</span>: {active.length} gastos · {fmtMoney(total, { decimals: true })}.
          Llegan del banco (Banco) y de las facturas del SRI; a mano solo lo pagado en efectivo.
        </p>
        {canEdit && (
          <div className="flex gap-2">
            <Link href={`/dashboard/gastos?mes=${ym}`} className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted">
              Gastos con comprobante e IA →
            </Link>
            <SriImportDialog />
            <ExpenseDialog defaultDate={defaultDate} />
          </div>
        )}
      </div>

      {payables.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Cuentas por pagar</h2>
          <ExpenseTable rows={payables} canEdit={canEdit} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Gastos del mes</h2>
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            No hay gastos registrados en este mes.
          </div>
        ) : (
          <ExpenseTable rows={rows} canEdit={canEdit} />
        )}
      </section>
    </div>
  );
}
