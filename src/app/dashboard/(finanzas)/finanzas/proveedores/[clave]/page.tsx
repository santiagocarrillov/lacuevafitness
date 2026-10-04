import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { DOC_TYPE_LABELS, ENTITIES, ENTITY_ORDER, EXPENSE_CATEGORY_LABELS, fmtMoney } from "@/lib/finance/entities";
import { supplierExpenses } from "@/lib/finance/suppliers";
import { PageHeader } from "../../../page-header";
import { Panel } from "../../../blocks";

export const dynamic = "force-dynamic";

export default async function ProveedorPage({ params }: { params: Promise<{ clave: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const { clave } = await params;
  const rows = await supplierExpenses(ENTITY_ORDER, decodeURIComponent(clave));
  if (rows.length === 0) notFound();
  const live = rows.filter((r) => !r.voidedAt);
  const name = rows.find((r) => r.supplierName)?.supplierName ?? rows[0].description;
  const ruc = rows[0].supplierRuc;
  const total = live.reduce((a, r) => a + r.amountCents, 0);
  const iva = live.reduce((a, r) => a + (r.ivaCents ?? 0), 0);
  const payable = live.filter((r) => r.status === "PENDING").reduce((a, r) => a + r.amountCents, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title={name} subtitle={ruc ? `RUC ${ruc}` : "Proveedor sin RUC registrado"} />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Compras (todas las fechas)", value: fmtMoney(total, { decimals: true }) },
          { label: "IVA pagado (crédito tributario)", value: fmtMoney(iva, { decimals: true }) },
          { label: "Por pagar", value: fmtMoney(payable, { decimals: true }) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xl font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>
      <Panel title="Documentos">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium">Documento</th>
                <th className="hidden py-2 pr-3 font-medium md:table-cell">Detalle</th>
                <th className="hidden py-2 pr-3 font-medium sm:table-cell">Empresa</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b last:border-0 hover:bg-stone-50 ${r.voidedAt ? "text-muted-foreground line-through" : ""}`}>
                  <td className="py-2 pr-3 tabular-nums">{r.date.toISOString().slice(0, 10)}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/dashboard/gastos/${r.id}`} className="hover:underline">
                      {DOC_TYPE_LABELS[r.documentType]}
                      {r.documentNumber && <span className="text-muted-foreground"> {r.documentNumber}</span>}
                    </Link>
                  </td>
                  <td className="hidden py-2 pr-3 text-muted-foreground md:table-cell">
                    {r.description} · {EXPENSE_CATEGORY_LABELS[r.category]}
                  </td>
                  <td className="hidden py-2 pr-3 text-muted-foreground sm:table-cell">{ENTITIES[r.sede].name.replace("La Cueva ", "")}</td>
                  <td className="py-2 pr-3 text-xs">
                    {r.voidedAt ? "Anulado" : r.status === "PENDING" ? <span className="text-amber-700">Por pagar</span> : <span className="text-emerald-700">Pagado</span>}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">{fmtMoney(r.amountCents, { decimals: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
