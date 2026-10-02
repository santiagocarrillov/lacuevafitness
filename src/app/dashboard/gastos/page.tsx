import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { ecuadorDateString } from "@/lib/timezone";
import { countPendingReview, listExpensesScoped } from "@/lib/actions/expenses";
import { DOC_TYPE_LABELS, ENTITIES, monthLabel, shiftMonth } from "@/lib/finance/entities";
import { fmtUsd } from "@/lib/invoicing/core";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { expenseScope } from "./shared";
import { ExpenseRowActions } from "./row-actions";

export const dynamic = "force-dynamic";

export default async function GastosPage({ searchParams }: { searchParams: Promise<{ mes?: string; ver?: string }> }) {
  const user = await requireAuth();
  const scope = await expenseScope(user);
  if (!scope) redirect("/dashboard?forbidden=1");
  const params = await searchParams;
  const thisMonth = ecuadorDateString().slice(0, 7);
  const ym = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? params.mes! : thisMonth;
  const pendingOnly = params.ver === "revisar" && scope.full;
  const [rows, pending] = await Promise.all([listExpensesScoped(ym, { pendingReview: pendingOnly }), countPendingReview()]);
  const live = rows.filter((r) => !r.voidedAt);
  const total = live.reduce((a, r) => a + r.amountCents, 0);
  const href = (u: { mes?: string; ver?: string }) => `/dashboard/gastos?${new URLSearchParams({ mes: ym, ...(pendingOnly ? { ver: "revisar" } : {}), ...u })}`;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Gastos</h1>
          <p className="text-sm text-muted-foreground">
            {scope.full
              ? "Todo lo que se compra o se paga, con su comprobante. Lo que registran los admins queda por revisar."
              : `Compras y pagos de ${ENTITIES[scope.sedes[0]].name}: caja chica, insumos, bebidas, arreglos y más. Sube la foto del comprobante.`}
          </p>
        </div>
        <Link href="/dashboard/gastos/nuevo" className={buttonVariants()}>
          Registrar gasto
        </Link>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {pendingOnly ? (
          <Link href={`/dashboard/gastos?mes=${ym}`} className="text-sm text-primary hover:underline">← Ver por mes</Link>
        ) : (
          <nav className="flex items-center gap-1 text-sm" aria-label="Mes">
            <Link href={href({ mes: shiftMonth(ym, -1) })} className="rounded-md border px-2.5 py-1.5 hover:bg-muted">←</Link>
            <span className="min-w-36 text-center font-medium capitalize">{monthLabel(ym)}</span>
            <Link
              href={href({ mes: shiftMonth(ym, 1) })}
              aria-disabled={ym >= thisMonth}
              className={`rounded-md border px-2.5 py-1.5 hover:bg-muted ${ym >= thisMonth ? "pointer-events-none opacity-40" : ""}`}
            >
              →
            </Link>
          </nav>
        )}
        <div className="flex items-center gap-3 text-sm">
          {scope.full && pending > 0 && !pendingOnly && (
            <Link href="/dashboard/gastos?ver=revisar" className="font-medium text-amber-700 hover:underline dark:text-amber-300">
              {pending} por revisar
            </Link>
          )}
          <span className="text-muted-foreground">{live.length} gastos · {fmtUsd(total)}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Proveedor</th>
              <th className="px-3 py-2 font-medium">Detalle</th>
              {scope.full && <th className="px-3 py-2 font-medium">Entidad</th>}
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Registró</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t align-top ${r.voidedAt ? "text-muted-foreground line-through" : ""}`}>
                <td className="whitespace-nowrap px-3 py-2">{r.date.toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2">
                  <Link href={`/dashboard/gastos/${r.id}`} className="text-primary hover:underline">{r.supplierName ?? "—"}</Link>
                  <p className="text-xs text-muted-foreground">
                    {DOC_TYPE_LABELS[r.documentType]}{r.documentNumber ? ` ${r.documentNumber}` : ""}{r.receiptPath ? " · 📎" : ""}
                  </p>
                </td>
                <td className="px-3 py-2">
                  {r.lines.length ? (
                    r.lines.map((l) => (
                      <p key={l.id} className="text-xs">
                        <span className="text-muted-foreground">{l.account.name}:</span> {l.description}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs">{r.description}</p>
                  )}
                </td>
                {scope.full && <td className="px-3 py-2 text-xs">{ENTITIES[r.sede].name}{r.isPrivate ? " · 🔒" : ""}</td>}
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtUsd(r.amountCents)}
                  {r.status === "PENDING" && <p className="text-[11px] text-amber-700 dark:text-amber-300">por pagar</p>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.createdByName ?? "Automático"}
                  {!r.reviewedAt && !r.voidedAt && <Badge variant="outline" className="ml-1">por revisar</Badge>}
                </td>
                <td className="px-3 py-2 text-right">
                  {!r.voidedAt && (
                    <ExpenseRowActions
                      id={r.id}
                      canReview={scope.full && !r.reviewedAt}
                      canVoid={scope.full || (r.createdById === user.id && !r.reviewedAt)}
                    />
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  {pendingOnly ? "No hay gastos por revisar." : "No hay gastos en este mes."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
