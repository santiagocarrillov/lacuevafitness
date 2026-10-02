import { listFixedAssets } from "@/lib/actions/fixed-assets";
import Link from "next/link";
import { fmtUsd } from "@/lib/invoicing/core";
import type { Sede } from "@/generated/prisma/enums";
import { RegisterAssetButton } from "./activos-actions";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function ActivosTab({ sede, canEdit }: { sede: Sede; canEdit: boolean }) {
  const { assets, pending } = await listFixedAssets(sede);
  const live = assets.filter((a) => !a.disposedOn);
  const sum = (k: "costCents" | "accumulatedCents" | "netCents" | "monthlyCents") => live.reduce((s, a) => s + a[k], 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Línea recta, 10 % anual por defecto (como en los estados financieros 2025). La depreciación se contabiliza sola el último día
        de cada mes; una compra empieza a depreciarse el mes siguiente. La vida útil se puede cambiar por activo (computadoras: 36 meses).
      </p>

      {pending.length > 0 && (
        <section className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30">
          <h2 className="text-sm font-semibold">Compras por registrar como activo</h2>
          <ul className="space-y-1 text-sm">
            {pending.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {ymd(l.expense.date)} · <Link href={`/dashboard/gastos/${l.expenseId}`} className="underline">{l.description}</Link> · {l.expense.supplierName ?? "—"} · <span className="tabular-nums">{fmtUsd(l.subtotalCents)}</span>{" "}
                  <span className="text-muted-foreground">({l.account.name})</span>
                </span>
                {canEdit && <RegisterAssetButton lineId={l.id} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Activo</th>
              <th className="px-3 py-2 font-medium">Cuenta</th>
              <th className="px-3 py-2 font-medium">Desde</th>
              <th className="px-3 py-2 text-right font-medium">Costo</th>
              <th className="px-3 py-2 text-right font-medium">Vida (meses)</th>
              <th className="px-3 py-2 text-right font-medium">Cuota mensual</th>
              <th className="px-3 py-2 text-right font-medium">Depreciado</th>
              <th className="px-3 py-2 text-right font-medium">Valor en libros</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className={`border-t ${a.disposedOn ? "text-muted-foreground" : ""}`}>
                <td className="px-3 py-2">
                  {a.expenseLine ? <Link href={`/dashboard/gastos/${a.expenseLine.expenseId}`} className="hover:underline">{a.name}</Link> : a.name}
                  {a.disposedOn && <p className="text-xs">Baja {ymd(a.disposedOn)}: {a.disposalNote}</p>}
                </td>
                <td className="px-3 py-2 text-xs">{a.account.name}</td>
                <td className="px-3 py-2 text-xs">{ymd(a.startsOn).slice(0, 7)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(a.costCents)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{a.usefulLifeMonths}</td>
                <td className="px-3 py-2 text-right tabular-nums">{a.disposedOn ? "—" : fmtUsd(a.monthlyCents)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(a.accumulatedCents)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{a.disposedOn ? "—" : fmtUsd(a.netCents)}</td>
                <td className="px-3 py-2 text-right">
                  {canEdit && !a.disposedOn && (
                    <Link href={`/dashboard/contabilidad/activos/${a.id}`} className="text-xs font-medium text-primary hover:underline">Editar</Link>
                  )}
                </td>
              </tr>
            ))}
            {assets.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Sin activos fijos registrados.</td>
              </tr>
            )}
          </tbody>
          {live.length > 0 && (
            <tfoot className="border-t font-medium">
              <tr>
                <td className="px-3 py-2" colSpan={3}>Total vigente</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(sum("costCents"))}</td>
                <td />
                <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(sum("monthlyCents"))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(sum("accumulatedCents"))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(sum("netCents"))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
