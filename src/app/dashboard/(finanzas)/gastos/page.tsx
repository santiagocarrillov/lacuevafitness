import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { ecuadorDateString } from "@/lib/timezone";
import { countPendingReview, listExpensesScoped } from "@/lib/actions/expenses";
import { DOC_TYPE_LABELS, ENTITIES, EXPENSE_CATEGORY_LABELS, monthLabel, shiftMonth } from "@/lib/finance/entities";
import type { ExpenseCategory, ExpenseDocType, Sede } from "@/generated/prisma/enums";
import { fmtUsd } from "@/lib/invoicing/core";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { expenseScope } from "./shared";
import { ExpenseRowActions } from "./row-actions";

export const dynamic = "force-dynamic";

type Params = { mes?: string; ver?: string; entidad?: string; categoria?: string; doc?: string };

export default async function GastosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireAuth();
  const scope = await expenseScope(user);
  if (!scope) redirect("/dashboard?forbidden=1");
  const params = await searchParams;
  const thisMonth = ecuadorDateString().slice(0, 7);
  const ym = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? params.mes! : thisMonth;
  const pendingOnly = params.ver === "revisar" && scope.full;
  const payablesOnly = params.ver === "porpagar";
  const sede = scope.full && (params.entidad === "XTREME" || params.entidad === "FITNESS_CENTER") ? (params.entidad as Sede) : undefined;
  const category = params.categoria && params.categoria in EXPENSE_CATEGORY_LABELS ? (params.categoria as ExpenseCategory) : undefined;
  const docType = params.doc && params.doc in DOC_TYPE_LABELS ? (params.doc as ExpenseDocType) : undefined;
  const [rows, pending, payables] = await Promise.all([
    listExpensesScoped(ym, { pendingReview: pendingOnly, payables: payablesOnly, sede, category, docType }),
    countPendingReview(),
    payablesOnly ? Promise.resolve(0) : listExpensesScoped(ym, { payables: true }).then((r) => r.length),
  ]);
  const live = rows.filter((r) => !r.voidedAt);
  const total = live.reduce((a, r) => a + r.amountCents, 0);
  const keep: Record<string, string> = {
    mes: ym,
    ...(params.ver ? { ver: params.ver } : {}),
    ...(sede ? { entidad: sede } : {}),
    ...(category ? { categoria: category } : {}),
    ...(docType ? { doc: docType } : {}),
  };
  const href = (u: Record<string, string>) => {
    const q = new URLSearchParams({ ...keep, ...u });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `/dashboard/gastos?${q}`;
  };
  const filters: { label: string; clear: Record<string, string> }[] = [];
  if (sede) filters.push({ label: ENTITIES[sede].name, clear: { entidad: "" } });
  if (category) filters.push({ label: EXPENSE_CATEGORY_LABELS[category], clear: { categoria: "" } });
  if (docType) filters.push({ label: DOC_TYPE_LABELS[docType], clear: { doc: "" } });

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
        <div className="flex flex-wrap gap-2">
          {scope.full && <Link href="/dashboard/gastos/importar-sri" className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted">Facturas del SRI</Link>}
          <Link href="/dashboard/gastos/nuevo" className={buttonVariants()}>
            Registrar gasto
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {pendingOnly || payablesOnly ? (
          <h2 className="text-sm font-semibold">{pendingOnly ? "Por revisar" : "Cuentas por pagar (todas las fechas)"}</h2>
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
          {payables > 0 && (
            <Link href="/dashboard/gastos?ver=porpagar" className="font-medium text-amber-700 hover:underline dark:text-amber-300">
              {payables} por pagar
            </Link>
          )}
          {(pendingOnly || payablesOnly) && (
            <Link href={`/dashboard/gastos?mes=${ym}`} className="text-primary hover:underline">Ver por mes</Link>
          )}
          <span className="text-muted-foreground">{live.length} gastos · {fmtUsd(total)}</span>
        </div>
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Filtro:</span>
          {filters.map((f) => (
            <Link key={f.label} href={href(f.clear)} className="rounded-full border px-2.5 py-0.5 hover:bg-muted">
              {f.label} ✕
            </Link>
          ))}
        </div>
      )}

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
                    <Link href={href({ doc: r.documentType })} className="hover:underline">{DOC_TYPE_LABELS[r.documentType]}</Link>
                    {r.documentNumber ? ` ${r.documentNumber}` : ""}{r.receiptPath ? " · 📎" : ""}
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
                {scope.full && (
                  <td className="px-3 py-2 text-xs">
                    <Link href={href({ entidad: r.sede })} className="hover:underline">{ENTITIES[r.sede].name}</Link>
                    {r.isPrivate ? " · 🔒" : ""}
                  </td>
                )}
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtUsd(r.amountCents)}
                  {r.status === "PENDING" && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      por pagar{r.dueDate ? ` · vence ${r.dueDate.toISOString().slice(0, 10)}` : ""}
                    </p>
                  )}
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
                  {pendingOnly ? "No hay gastos por revisar." : payablesOnly ? "No hay cuentas por pagar." : "No hay gastos con este filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
