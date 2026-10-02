import Link from "next/link";
import { ENTITIES, ENTITY_ORDER, DOC_TYPE_LABELS, monthLabel } from "@/lib/finance/entities";
import { fmtUsd } from "@/lib/invoicing/core";
import { ivaMonth, IVA_START, type IvaMonth } from "@/lib/taxes/iva";
import { reportablePurchases } from "@/lib/taxes/ats";
import { prisma } from "@/lib/prisma";
import { shiftMonth } from "@/lib/finance/entities";

function Row({ c, label, value, strong, href }: { c: string; label: string; value: number; strong?: boolean; href?: string }) {
  return (
    <tr className={`border-t ${strong ? "font-semibold" : ""}`}>
      <td className="w-14 py-1.5 font-mono text-xs text-muted-foreground">{c}</td>
      <td className="py-1.5">{href ? <Link href={href} className="hover:underline">{label}</Link> : label}</td>
      <td className="py-1.5 text-right tabular-nums">{href && value ? <Link href={href} className="hover:underline">{fmtUsd(value)}</Link> : fmtUsd(value)}</td>
    </tr>
  );
}

function EntityCard({ m, ivaAccountId, prevYm }: { m: IvaMonth; ivaAccountId?: string; prevYm: string | null }) {
  const e = ENTITIES[m.sede];
  const g = (doc: string) => `/dashboard/gastos?mes=${m.ym}&entidad=${m.sede}&doc=${doc}`;
  const ivaLedger = ivaAccountId ? `/dashboard/contabilidad?tab=mayor&entidad=${m.sede}&mes=${m.ym}&cuenta=${ivaAccountId}` : undefined;
  const p = m.purchases;
  const issues = p.docs.filter((d) => d.problems.length);
  const reportable = reportablePurchases(p.docs).length;
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{e.legalName}</h2>
          <p className="text-xs text-muted-foreground">RUC {e.ruc} · formulario 104 mensual</p>
        </div>
        {m.sede === "XTREME" && (
          <a href={`/dashboard/finanzas/ats?mes=${m.ym}`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            Descargar ATS ({reportable} compras)
          </a>
        )}
      </div>
      <table className="w-full text-sm">
        <tbody>
          <tr><td colSpan={3} className="pb-1 text-xs font-semibold uppercase text-muted-foreground">Ventas</td></tr>
          <Row c="401/411" label="Ventas locales gravadas 15 % (base)" value={m.sales.baseCents} href={`/dashboard/facturas?mes=${m.ym}`} />
          <Row c="421" label="IVA generado" value={m.sales.ivaCents} href={ivaLedger} />
          <tr><td colSpan={3} className="pt-3 pb-1 text-xs font-semibold uppercase text-muted-foreground">Compras</td></tr>
          <Row c="500/510" label={`Adquisiciones gravadas con crédito tributario (${p.credit.count})`} value={p.credit.baseCents} href={g("FACTURA")} />
          <Row c="520" label="IVA de esas compras" value={p.credit.ivaCents} href={g("FACTURA")} />
          <Row c="507/517" label={`Adquisiciones tarifa 0 % (${p.zero.count})`} value={p.zero.baseCents} href={g("FACTURA")} />
          <Row c="508/518" label={`Compras a negocios populares, notas de venta (${p.popular.count})`} value={p.popular.totalCents} href={g("NOTA_VENTA")} />
          <tr><td colSpan={3} className="pt-3 pb-1 text-xs font-semibold uppercase text-muted-foreground">Resumen</td></tr>
          <Row c="499" label="Total impuesto a liquidar este mes" value={m.sales.ivaCents} />
          <Row c="564" label="Crédito tributario aplicable (factor 1: todo lo vendido es gravado)" value={m.creditApplied564} />
          <Row c="605" label="Saldo de crédito tributario del mes anterior" value={m.credit605} href={prevYm ? `/dashboard/finanzas?tab=impuestos&mes=${prevYm}` : undefined} />
          <Row c="601 · 699" label="IVA a pagar" value={m.toPay} strong />
          <Row c="615" label="Saldo de crédito tributario para el próximo mes" value={m.carry615} />
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        Ventas: {m.sales.appInvoices.count} facturas de la app, {m.sales.collections.count} cobros (facturados en Ecuafact mientras dura la
        transición) y {m.sales.products.count} ventas de productos.
        {p.notDeclared.count > 0 && (
          <>
            {" "}
            <Link href={g("SIN_DOCUMENTO")} className="underline">{p.notDeclared.count} gastos con recibo o sin documento</Link> (
            {fmtUsd(p.notDeclared.totalCents)}) no van al 104.
          </>
        )}
      </p>
      {issues.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Compras con datos incompletos ({issues.length}): corrígelas en Gastos para que entren bien al ATS.</p>
          <ul className="mt-1 space-y-0.5">
            {issues.slice(0, 12).map((d) => (
              <li key={d.expenseId}>
                <Link href={`/dashboard/gastos/${d.expenseId}`} className="underline">
                  {d.date.toISOString().slice(0, 10)} · {d.supplierName ?? "—"} · {DOC_TYPE_LABELS[d.documentType]} · {fmtUsd(d.totalCents)}
                </Link>
                : {d.problems.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export async function ImpuestosTab({ ym }: { ym: string }) {
  if (ym < IVA_START) {
    return <p className="text-sm text-muted-foreground">La app lleva el IVA desde enero 2026.</p>;
  }
  const [months, ivaAccounts] = await Promise.all([
    Promise.all(ENTITY_ORDER.map((s) => ivaMonth(s, ym))),
    prisma.ledgerAccount.findMany({ where: { code: "2.1.06" }, select: { id: true, sede: true } }),
  ]);
  const prevYm = ym > IVA_START ? shiftMonth(ym, -1) : null;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Borrador de la declaración de IVA de <span className="capitalize">{monthLabel(ym)}</span> con lo registrado en la app: compáralo con
        lo emitido en Ecuafact y con el 615 de tu declaración anterior antes de declarar. Se declara el mes siguiente según el noveno dígito del RUC.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {months.map((m) => (
          <EntityCard key={m.sede} m={m} prevYm={prevYm} ivaAccountId={ivaAccounts.find((a) => a.sede === m.sede)?.id} />
        ))}
      </div>
    </div>
  );
}
