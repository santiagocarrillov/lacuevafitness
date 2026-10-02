// Electronic emission (server only, no auth — callers check permissions):
// sign → Recepción → Autorización → store authorized XML → email RIDE + XML.
// Each step persists its outcome on the Invoice so a retry resumes safely.

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import type { Prisma, Sede } from "@/generated/prisma/client";
import { ENTITIES } from "@/lib/finance/entities";
import { readFinanceDoc, storeSriXml } from "@/lib/storage/upload";
import { formatDocNumber } from "@/lib/invoicing/core";
import { getInvoice, invoiceXml, type InvoiceDetail } from "@/lib/invoicing/queries";
import { loadP12, signSriXml, type SigningCert } from "@/lib/invoicing/xades";
import { authorizedXml, checkAuthorization, sendToSri, type SriMessage } from "@/lib/invoicing/sri-ws";
import { renderRide } from "@/lib/invoicing/ride";

export const CERT_PATH = (sede: Sede) => `certs/${sede}.p12`;
export const CERT_PASSWORD_ENV = (sede: Sede) => `SRI_CERT_PASSWORD_${sede}`;

export type CertStatus = {
  sede: Sede;
  uploaded: boolean;
  passwordSet: boolean;
  ready: boolean;
  subject?: string;
  issuer?: string;
  validUntil?: string;
  error?: string;
};

const certCache = new Map<Sede, { at: number; cert: SigningCert }>();

export async function loadEntityCert(sede: Sede): Promise<SigningCert> {
  const cached = certCache.get(sede);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.cert;
  const password = process.env[CERT_PASSWORD_ENV(sede)];
  if (!password) throw new Error(`Falta la clave de la firma: variable ${CERT_PASSWORD_ENV(sede)} en Vercel.`);
  const p12 = await readFinanceDoc(CERT_PATH(sede));
  if (!p12) throw new Error(`Falta subir la firma electrónica de ${ENTITIES[sede].name}.`);
  const cert = loadP12(p12, password);
  if (cert.notAfter.getTime() < Date.now()) throw new Error(`La firma electrónica de ${ENTITIES[sede].name} venció el ${cert.notAfter.toISOString().slice(0, 10)}.`);
  certCache.set(sede, { at: Date.now(), cert });
  return cert;
}

export function forgetEntityCert(sede: Sede) {
  certCache.delete(sede);
}

export async function certStatus(sede: Sede): Promise<CertStatus> {
  const passwordSet = !!process.env[CERT_PASSWORD_ENV(sede)];
  const uploaded = !!(await readFinanceDoc(CERT_PATH(sede)));
  if (!uploaded || !passwordSet) return { sede, uploaded, passwordSet, ready: false };
  try {
    const c = await loadEntityCert(sede);
    return { sede, uploaded, passwordSet, ready: true, subject: c.subject, issuer: c.issuer, validUntil: c.notAfter.toISOString().slice(0, 10) };
  } catch (e) {
    return { sede, uploaded, passwordSet, ready: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const json = (m: SriMessage[]) => m as unknown as Prisma.InputJsonValue;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type EmitResult = { status: string; messages: SriMessage[] };

/** Sends a DRAFT/REJECTED invoice to the SRI and waits briefly for authorization. */
export async function emitInvoice(id: string): Promise<EmitResult> {
  const inv = await getInvoice(id);
  if (!inv) throw new Error("No existe la factura.");
  if (inv.status === "VOIDED") throw new Error("La factura está anulada.");
  if (inv.status === "AUTHORIZED") return { status: inv.status, messages: [] };
  if (inv.status === "SENT") return refreshAuthorization(id);

  const entity = ENTITIES[inv.sede];
  if (inv.environment === "PRODUCCION" && !entity.matrixAddress) {
    throw new Error(`Falta la dirección matriz del RUC de ${entity.name} (ENTITIES.matrixAddress).`);
  }
  const cert = await loadEntityCert(inv.sede);
  const signed = signSriXml(invoiceXml(inv), cert);
  const rec = await sendToSri(inv.environment, signed);

  if (rec.state === "DEVUELTA" && !rec.alreadyReceived) {
    await prisma.invoice.update({ where: { id }, data: { status: "REJECTED", sriMessages: json(rec.messages) } });
    return { status: "REJECTED", messages: rec.messages };
  }
  await prisma.invoice.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), sriMessages: json(rec.messages) } });
  // The SRI usually authorizes within seconds.
  for (let i = 0; i < 3; i++) {
    await sleep(i === 0 ? 1500 : 3000);
    const r = await refreshAuthorization(id);
    if (r.status !== "SENT") return r;
  }
  return { status: "SENT", messages: rec.messages };
}

/** Asks the SRI for the authorization of a SENT invoice and records the outcome. */
export async function refreshAuthorization(id: string): Promise<EmitResult> {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id } });
  if (inv.status !== "SENT") return { status: inv.status, messages: (inv.sriMessages as SriMessage[] | null) ?? [] };
  const a = await checkAuthorization(inv.environment, inv.accessKey);
  if (a.state === "AUTORIZADO") {
    const path = await storeSriXml(inv.accessKey, authorizedXml({ number: a.number, date: a.date, env: inv.environment, signedXml: a.signedXml }));
    await prisma.invoice.update({
      where: { id },
      data: { status: "AUTHORIZED", authorizedAt: a.date, authorizationNumber: a.number, xmlPath: path, sriMessages: json(a.messages) },
    });
    // Real invoices go to the client right away; test ones only on request.
    if (inv.environment === "PRODUCCION" && inv.buyerEmail) await emailInvoice(id).catch((e) => console.error("[invoicing] email", e));
    return { status: "AUTHORIZED", messages: a.messages };
  }
  if (a.state === "NO AUTORIZADO") {
    await prisma.invoice.update({ where: { id }, data: { status: "REJECTED", sriMessages: json(a.messages) } });
    return { status: "REJECTED", messages: a.messages };
  }
  return { status: "SENT", messages: a.messages };
}

export function rideInput(inv: InvoiceDetail) {
  return {
    sede: inv.sede,
    environment: inv.environment,
    establishment: inv.emissionPoint.establishment,
    point: inv.emissionPoint.point,
    establishmentAddress: inv.emissionPoint.address,
    sequential: inv.sequential,
    accessKey: inv.accessKey,
    authorizationNumber: inv.authorizationNumber,
    authorizedAt: inv.authorizedAt,
    issueDate: inv.issueDate,
    buyerIdType: inv.buyerIdType,
    buyerId: inv.buyerId,
    buyerName: inv.buyerName,
    buyerAddress: inv.buyerAddress,
    buyerEmail: inv.buyerEmail,
    buyerPhone: inv.buyerPhone,
    payForm: inv.sriPayForm,
    totalCents: inv.totalCents,
    ivaCents: inv.ivaCents,
    lines: inv.lines.map((l) => ({
      code: l.code,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      discountCents: l.discountCents,
      ivaRate: l.ivaRate,
    })),
  };
}

const FROM = process.env.INVOICE_EMAIL_FROM || "La Cueva <web@lacuevasrxfit.com>";

/** Emails the RIDE (PDF) and the authorized XML to the buyer, or to `to`. */
export async function emailInvoice(id: string, to?: string): Promise<{ to: string }> {
  const inv = await getInvoice(id);
  if (!inv) throw new Error("No existe la factura.");
  if (inv.status !== "AUTHORIZED" || !inv.xmlPath) throw new Error("Solo se envían facturas autorizadas por el SRI.");
  const dest = (to ?? inv.buyerEmail ?? "").trim();
  if (!dest) throw new Error("El cliente no tiene correo.");
  if (!process.env.RESEND_API_KEY) throw new Error("Falta RESEND_API_KEY.");
  const xml = await readFinanceDoc(inv.xmlPath);
  if (!xml) throw new Error("No se encontró el XML autorizado.");
  const pdf = await renderRide(rideInput(inv));
  const number = formatDocNumber(inv.emissionPoint.establishment, inv.emissionPoint.point, inv.sequential);
  const e = ENTITIES[inv.sede];
  const test = inv.environment === "PRUEBAS" ? " (PRUEBAS, sin validez)" : "";
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: FROM,
    to: [dest],
    subject: `Factura ${number} · ${e.tradeName}${test}`,
    text: [
      `Hola ${inv.buyerName},`,
      "",
      `Adjuntamos tu factura electrónica ${number} por $${(inv.totalCents / 100).toFixed(2)}${test}.`,
      `Clave de acceso: ${inv.accessKey}`,
      "",
      `Gracias por entrenar en ${e.tradeName}.`,
    ].join("\n"),
    attachments: [
      { filename: `factura-${number}.pdf`, content: Buffer.from(pdf) },
      { filename: `factura-${number}.xml`, content: xml },
    ],
  });
  if (error) throw new Error(`No se pudo enviar el correo: ${error.message}`);
  await prisma.invoice.update({ where: { id }, data: { emailedAt: new Date() } });
  return { to: dest };
}
