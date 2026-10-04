import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DOC_TYPE_LABELS, ENTITIES, EXPENSE_CATEGORY_LABELS, fmtMoney } from "@/lib/finance/entities";
import { TAX_ID_LABELS } from "@/lib/invoicing/core";
import { payablesAging, daysOverdue } from "@/lib/finance/suppliers";
import { ecuadorDateString } from "@/lib/timezone";
import { PageHeader } from "../../../page-header";
import { Panel } from "../../../blocks";
import { AgingBar } from "../aging";
import { ArchiveSupplierButton } from "./archive-button";

export const dynamic = "force-dynamic";

export default async function ProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const today = ecuadorDateString();
  const s = await prisma.supplier.findUnique({ where: { id } });
  if (!s) notFound();
  const [docs, aging, account] = await Promise.all([
    prisma.expense.findMany({
      where: { supplierId: id, isPrivate: false },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true, sede: true, date: true, description: true, category: true, documentType: true, documentNumber: true,
        amountCents: true, ivaCents: true, status: true, dueDate: true, paidAt: true, voidedAt: true,
      },
    }),
    payablesAging({ supplierId: id, isPrivate: false }, today),
    s.defaultAccountCode ? prisma.ledgerAccount.findFirst({ where: { code: s.defaultAccountCode }, select: { name: true } }) : null,
  ]);
  const live = docs.filter((d) => !d.voidedAt);
  const year = today.slice(0, 4);
  const yearCents = live.filter((d) => d.date.toISOString().startsWith(year)).reduce((a, d) => a + d.amountCents, 0);
  const allCents = live.reduce((a, d) => a + d.amountCents, 0);
  const iva = live.reduce((a, d) => a + (d.ivaCents ?? 0), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={s.tradeName ?? s.name}
        subtitle={[s.tradeName ? s.name : null, s.taxId ? `${s.taxIdType ? TAX_ID_LABELS[s.taxIdType] : "RUC"} ${s.taxId}` : "Sin RUC", !s.active ? "Archivado" : null].filter(Boolean).join(" · ")}
      >
        <Link href={`/dashboard/gastos/nuevo?proveedor=${s.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#d97e0a] px-4 text-sm font-medium text-white hover:opacity-90">
          <Plus className="size-4" /> Registrar gasto
        </Link>
        <Link href={`/dashboard/finanzas/proveedores/${s.id}/editar`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-300 px-3.5 text-sm font-medium hover:border-stone-500">
          <Pencil className="size-3.5" /> Editar
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: `Compras ${year}`, value: fmtMoney(yearCents, { decimals: true }) },
          { label: "Compras (todas las fechas)", value: fmtMoney(allCents, { decimals: true }) },
          { label: "IVA pagado (crédito tributario)", value: fmtMoney(iva, { decimals: true }) },
          { label: "Por pagar", value: fmtMoney(aging.total, { decimals: true }) },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-xs text-muted-foreground">{x.label}</p>
            <p className="text-xl font-semibold tabular-nums">{x.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Datos">
          <dl className="space-y-1.5 text-sm">
            {[
              ["Contacto", s.contactName],
              ["Teléfono", s.phone],
              ["Correo", s.email],
              ["Dirección", s.address],
              ["Plazo de pago", s.paymentTermsDays != null ? `${s.paymentTermsDays} días` : null],
              ["Cuenta habitual", s.defaultAccountCode ? `${s.defaultAccountCode} · ${account?.name ?? ""}` : null],
              ["Notas", s.notes],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className={v ? "" : "text-muted-foreground"}>{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 border-t pt-3">
            <ArchiveSupplierButton id={s.id} active={s.active} />
          </div>
        </Panel>
        <Panel title="Lo que se le debe" className="lg:col-span-2">
          <AgingBar aging={aging} href={(b) => `/dashboard/gastos?ver=porpagar&proveedor=${s.id}${b ? `&antiguedad=${b}` : ""}`} />
        </Panel>
      </div>

      <Panel title="Documentos">
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin gastos registrados todavía.</p>
        ) : (
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
                {docs.map((d) => {
                  const late = d.status === "PENDING" && !d.voidedAt && daysOverdue(d, today) > 0;
                  return (
                    <tr key={d.id} className={`border-b last:border-0 hover:bg-stone-50 ${d.voidedAt ? "text-muted-foreground line-through" : ""}`}>
                      <td className="py-2 pr-3 tabular-nums">{d.date.toISOString().slice(0, 10)}</td>
                      <td className="py-2 pr-3">
                        <Link href={`/dashboard/gastos/${d.id}`} className="hover:underline">
                          {DOC_TYPE_LABELS[d.documentType]}
                          {d.documentNumber && <span className="text-muted-foreground"> {d.documentNumber}</span>}
                        </Link>
                      </td>
                      <td className="hidden py-2 pr-3 text-muted-foreground md:table-cell">{d.description} · {EXPENSE_CATEGORY_LABELS[d.category]}</td>
                      <td className="hidden py-2 pr-3 text-muted-foreground sm:table-cell">{ENTITIES[d.sede].name.replace("La Cueva ", "")}</td>
                      <td className="py-2 pr-3 text-xs">
                        {d.voidedAt ? "Anulado" : d.status === "PENDING" ? (
                          <span className={late ? "font-medium text-red-700" : "text-amber-700"}>
                            {late ? `Vencido hace ${daysOverdue(d, today)} días` : `Por pagar${d.dueDate ? ` · vence ${d.dueDate.toISOString().slice(0, 10)}` : ""}`}
                          </span>
                        ) : (
                          <span className="text-emerald-700">Pagado{d.paidAt ? ` el ${d.paidAt.toISOString().slice(0, 10)}` : ""}</span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium">{fmtMoney(d.amountCents, { decimals: true })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
