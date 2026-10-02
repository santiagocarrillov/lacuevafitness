import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ecuadorDateString } from "@/lib/timezone";
import { ENTITIES, monthLabel, monthRangeUtc, shiftMonth } from "@/lib/finance/entities";
import { fmtUsd, formatDocNumber } from "@/lib/invoicing/core";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "./status-badge";
import { EmissionPointsCard, SaleItemsCard } from "./config";

export const dynamic = "force-dynamic";

export default async function FacturasPage({ searchParams }: { searchParams: Promise<{ mes?: string; tab?: string }> }) {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  const params = await searchParams;
  const tab = params.tab === "config" ? "config" : "facturas";
  const thisMonth = ecuadorDateString().slice(0, 7);
  const ym = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? params.mes! : thisMonth;
  const { start, end } = monthRangeUtc(ym);
  const href = (u: { mes?: string; tab?: string }) => `/dashboard/facturas?${new URLSearchParams({ tab, mes: ym, ...u })}`;

  const [invoices, points, items, uninvoiced] = await Promise.all([
    prisma.invoice.findMany({
      where: { issueDate: { gte: start, lt: end } },
      include: { emissionPoint: true },
      orderBy: [{ issueDate: "desc" }, { sequential: "desc" }],
    }),
    prisma.emissionPoint.findMany({ orderBy: [{ sede: "asc" }, { establishment: "asc" }, { point: "asc" }] }),
    prisma.saleItem.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.payment.count({
      where: {
        isPoolEntry: false,
        status: { in: ["SUCCEEDED", "PENDING"] },
        paidAt: { gte: start, lt: end },
        OR: [{ invoiceId: null }, { invoice: { status: "VOIDED" } }],
      },
    }),
  ]);
  const live = invoices.filter((i) => i.status !== "VOIDED");
  const totalCents = live.reduce((a, i) => a + i.totalCents, 0);
  const ivaCents = live.reduce((a, i) => a + i.ivaCents, 0);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Facturación</h1>
          <p className="text-sm text-muted-foreground">
            Se factura al cobrar, por el total cobrado (precios con IVA). Emisión directa al SRI — por ahora en ambiente de pruebas.
          </p>
        </div>
        <Link href="/dashboard/facturas/nueva" className={buttonVariants()}>
          Cobrar y facturar
        </Link>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b">
        {[
          { key: "facturas", label: "Facturas" },
          { key: "config", label: "Configuración" },
        ].map((t) => (
          <Link
            key={t.key}
            href={href({ tab: t.key })}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "config" ? (
        <div className="space-y-6">
          <EmissionPointsCard
            points={points.map((p) => ({ id: p.id, sede: p.sede, establishment: p.establishment, point: p.point, address: p.address, lastSequential: p.lastSequential, environment: p.environment, active: p.active }))}
          />
          <SaleItemsCard
            items={items.map((s) => ({ id: s.id, sede: s.sede, name: s.name, priceCents: s.priceCents, ivaRate: s.ivaRate, kind: s.kind, incomeAccountCode: s.incomeAccountCode, active: s.active }))}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
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
            <p className="text-sm text-muted-foreground">
              {live.length} facturas · {fmtUsd(totalCents)} · IVA {fmtUsd(ivaCents)}
              {uninvoiced > 0 && (
                <>
                  {" · "}
                  <Link href="/dashboard/pagos" className="text-primary hover:underline">{uninvoiced} cobros sin factura</Link>
                </>
              )}
            </p>
          </div>

          {points.length === 0 && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Antes de facturar crea un punto de emisión en <Link href={href({ tab: "config" })} className="underline">Configuración</Link>.
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Número</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Entidad</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className={`border-t hover:bg-muted/30 ${i.status === "VOIDED" ? "text-muted-foreground line-through" : ""}`}>
                    <td className="px-3 py-2 font-mono">
                      <Link href={`/dashboard/facturas/${i.id}`} className="text-primary hover:underline">
                        {formatDocNumber(i.emissionPoint.establishment, i.emissionPoint.point, i.sequential)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{i.issueDate.toISOString().slice(0, 10)}</td>
                    <td className="px-3 py-2">{i.buyerName}</td>
                    <td className="px-3 py-2">{ENTITIES[i.sede].name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(i.totalCents)}</td>
                    <td className="px-3 py-2"><StatusBadge status={i.status} environment={i.environment} /></td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No hay facturas en este mes.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
