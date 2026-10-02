import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { ENTITIES } from "@/lib/finance/entities";
import { PAY_FORM_LABELS, fmtUsd, formatDocNumber } from "@/lib/invoicing/core";
import { getInvoice } from "@/lib/invoicing/queries";
import { StatusBadge } from "../status-badge";
import { VoidInvoiceButton } from "./void-button";
import { SriActions } from "./sri-actions";
import { certStatus } from "@/lib/invoicing/emit";
import type { SriMessage } from "@/lib/invoicing/sri-ws";

export const dynamic = "force-dynamic";

const ID_TYPE: Record<string, string> = { "04": "RUC", "05": "Cédula", "06": "Pasaporte", "07": "Consumidor final" };
const METHOD: Record<string, string> = {
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia",
  STRIPE_CARD: "Tarjeta",
  PLUX_CARD: "TC Plux",
  STRIPE_LINK: "Link de pago",
  OTHER: "Otro",
};

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const inv = await getInvoice(id);
  if (!inv) notFound();
  const e = ENTITIES[inv.sede];
  const cert = inv.status === "DRAFT" || inv.status === "REJECTED" ? await certStatus(inv.sede) : null;
  const messages = (inv.sriMessages as SriMessage[] | null) ?? [];
  const number = formatDocNumber(inv.emissionPoint.establishment, inv.emissionPoint.point, inv.sequential);
  const byRate = new Map<number, { base: number; iva: number }>();
  for (const l of inv.lines) {
    const r = byRate.get(l.ivaRate) ?? { base: 0, iva: 0 };
    r.base += l.subtotalCents;
    r.iva += l.ivaCents;
    byRate.set(l.ivaRate, r);
  }

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/dashboard/facturas" className="text-sm text-muted-foreground hover:underline">← Facturación</Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            Factura {number} <StatusBadge status={inv.status} environment={inv.environment} />
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SriActions id={inv.id} status={inv.status} certReady={cert?.ready ?? true} buyerEmail={inv.buyerEmail} />
          <a href={`/dashboard/facturas/${inv.id}/pdf`} target="_blank" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            PDF
          </a>
          <a href={`/dashboard/facturas/${inv.id}/xml`} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            XML
          </a>
          {(inv.status === "DRAFT" || inv.status === "REJECTED") && <VoidInvoiceButton id={inv.id} />}
        </div>
      </div>

      {inv.status === "DRAFT" && cert && !cert.ready && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Borrador: falta configurar la firma electrónica de {e.name} en{" "}
          <Link href="/dashboard/facturas?tab=config" className="underline">Configuración</Link>
          {cert.error ? ` (${cert.error})` : ""}.
        </p>
      )}
      {inv.emailedAt && (
        <p className="text-xs text-muted-foreground">Enviada por correo el {inv.emailedAt.toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}.</p>
      )}
      {messages.length > 0 && inv.status !== "AUTHORIZED" && (
        <div className={`rounded-md border px-3 py-2 text-sm ${inv.status === "REJECTED" ? "border-destructive/40 bg-destructive/5" : ""}`}>
          <p className="font-medium">Mensajes del SRI</p>
          <ul className="mt-1 space-y-1">
            {messages.map((m, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{m.id}</span> {m.message}
                {m.info && <span className="text-muted-foreground"> — {m.info}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {inv.status === "VOIDED" && (
        <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          Anulada el {inv.voidedAt?.toISOString().slice(0, 10)}: {inv.voidReason}. El cobro sigue registrado y se puede volver a facturar.
        </p>
      )}

      <article className="rounded-lg border bg-card text-sm shadow-sm">
        <div className="grid gap-4 border-b p-5 md:grid-cols-[1fr_320px]">
          <div className="space-y-1">
            <p className="text-base font-semibold">{e.legalName}</p>
            <p className="text-muted-foreground">{e.tradeName}</p>
            <p className="text-muted-foreground">Dir. matriz: {e.matrixAddress ?? inv.emissionPoint.address}</p>
            <p className="text-muted-foreground">Dir. establecimiento: {inv.emissionPoint.address}</p>
            <p className="text-muted-foreground">Obligado a llevar contabilidad: {e.accountingRequired ? "SÍ" : "NO"}</p>
          </div>
          <div className="space-y-1 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">R.U.C. {e.ruc}</p>
            <p className="text-lg font-bold tracking-wide">FACTURA</p>
            <p className="font-mono">No. {number}</p>
            <p className="text-xs text-muted-foreground">Número de autorización / clave de acceso</p>
            <p className="break-all font-mono text-xs">{inv.authorizationNumber ?? inv.accessKey}</p>
            <p className="text-xs">Ambiente: {inv.environment === "PRUEBAS" ? "PRUEBAS" : "PRODUCCIÓN"} · Emisión: NORMAL</p>
            {inv.authorizedAt && <p className="text-xs">Autorizada: {inv.authorizedAt.toISOString().replace("T", " ").slice(0, 16)}</p>}
          </div>
        </div>

        <div className="grid gap-1 border-b p-5 sm:grid-cols-2">
          <p><span className="text-muted-foreground">Cliente:</span> {inv.buyerName}</p>
          <p><span className="text-muted-foreground">{ID_TYPE[inv.buyerIdType] ?? "Identificación"}:</span> {inv.buyerId}</p>
          <p><span className="text-muted-foreground">Fecha de emisión:</span> {inv.issueDate.toISOString().slice(0, 10)}</p>
          {inv.buyerAddress && <p><span className="text-muted-foreground">Dirección:</span> {inv.buyerAddress}</p>}
          {inv.member && (
            <p>
              <span className="text-muted-foreground">Socio:</span>{" "}
              <Link href={`/dashboard/socios/${inv.member.id}`} className="text-primary hover:underline">
                {inv.member.firstName} {inv.member.lastName}
              </Link>
            </p>
          )}
        </div>

        <div className="overflow-x-auto border-b p-5">
          <table className="w-full min-w-[560px]">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Cód.</th>
                <th className="py-1 font-medium">Descripción</th>
                <th className="py-1 text-right font-medium">Cant.</th>
                <th className="py-1 text-right font-medium">P. unit. (con IVA)</th>
                <th className="py-1 text-right font-medium">Desc.</th>
                <th className="py-1 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="py-2 font-mono text-xs">{l.code}</td>
                  <td className="py-2">{l.description}</td>
                  <td className="py-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="py-2 text-right tabular-nums">{fmtUsd(l.unitPriceCents)}</td>
                  <td className="py-2 text-right tabular-nums">{l.discountCents ? fmtUsd(l.discountCents) : "—"}</td>
                  <td className="py-2 text-right tabular-nums">{fmtUsd(l.subtotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-6 p-5 md:grid-cols-[1fr_280px]">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">Forma de pago</p>
            <p>{inv.sriPayForm} · {PAY_FORM_LABELS[inv.sriPayForm] ?? ""}: {fmtUsd(inv.totalCents)}</p>
            {inv.buyerEmail && <p className="text-muted-foreground">Email: {inv.buyerEmail}</p>}
            {inv.buyerPhone && <p className="text-muted-foreground">Teléfono: {inv.buyerPhone}</p>}
            <p className="pt-2 text-xs font-semibold text-muted-foreground">Cobro registrado</p>
            {inv.payments.map((p) => (
              <p key={p.id} className="text-muted-foreground">
                {METHOD[p.method] ?? p.method} · {fmtUsd(p.amountCents)} · {p.status === "PENDING" ? "fondos sin depositar" : "confirmado"}
                {p.bankReference ? ` · ref. ${p.bankReference}` : ""}
              </p>
            ))}
            {inv.payments.length === 0 && <p className="text-muted-foreground">— (la factura fue anulada y el cobro quedó libre)</p>}
            {inv.notes && <p className="pt-2 text-xs text-muted-foreground">Nota interna: {inv.notes}</p>}
          </div>
          <dl className="space-y-1.5">
            {[...byRate.entries()].map(([rate, r]) => (
              <div key={rate} className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal {rate} %</dt>
                <dd className="tabular-nums">{fmtUsd(r.base)}</dd>
              </div>
            ))}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">IVA 15 %</dt>
              <dd className="tabular-nums">{fmtUsd(inv.ivaCents)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-lg font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{fmtUsd(inv.totalCents)}</dd>
            </div>
          </dl>
        </div>
      </article>
    </div>
  );
}
