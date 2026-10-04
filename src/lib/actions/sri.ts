"use server";

// Finanzas 1c — SRI received invoices: import the authorized XML files and
// check the SRI "recibidos" report for invoices not loaded yet, then fetch
// those straight from the SRI by access key.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import { storeSriXml } from "@/lib/storage/upload";
import type { Sede } from "@/generated/prisma/client";
import { isValidAccessKey, parseSriXml } from "@/lib/finance/sri-xml";
import { authorizedXml, checkAuthorization } from "@/lib/invoicing/sri-ws";
import {
  checkCompleteness,
  importSriDocument,
  type CompletenessReport,
  type SriOutcome,
} from "@/lib/finance/sri-core";

async function requireEdit() {
  const user = await requireAuth();
  if (!can.editFinancials(user)) throw new Error("No autorizado");
  return user;
}

/** Up to ~40 XML per call (the client sends them in batches under 1 MB). */
export async function importSriFiles(fd: FormData): Promise<SriOutcome[]> {
  const user = await requireEdit();
  const sede = String(fd.get("sede"));
  if (sede !== "FITNESS_CENTER" && sede !== "XTREME") throw new Error("Elige la entidad.");
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new Error("Elige los XML de las facturas.");

  const out: SriOutcome[] = [];
  for (const file of files) {
    const xml = await file.text();
    let doc;
    try {
      doc = parseSriXml(xml);
    } catch (err) {
      out.push({
        accessKey: "", issuerName: file.name, docNumber: "", totalCents: 0, status: "rejected",
        detail: err instanceof Error ? err.message : "No se pudo leer el XML.",
      });
      continue;
    }
    try {
      const receiptPath = await storeSriXml(doc.accessKey, xml);
      out.push(await prisma.$transaction((tx) => importSriDocument(tx, doc, { sede: sede as Sede, userId: user.id, receiptPath })));
    } catch (err) {
      out.push({
        accessKey: doc.accessKey, issuerName: doc.issuerName, docNumber: doc.docNumber, totalCents: doc.totalCents,
        status: "rejected", detail: err instanceof Error ? err.message : "No se pudo importar.",
      });
    }
  }
  revalidatePath("/dashboard/finanzas", "layout");
  return out;
}

/** Same check, from keys the browser already read out of one or more reports. */
export async function checkSriKeys(keys: string[]): Promise<CompletenessReport> {
  await requireEdit();
  const valid = [...new Set(keys)].filter(isValidAccessKey).slice(0, 5000);
  if (valid.length === 0) throw new Error("No encontré claves de acceso en el archivo.");
  return checkCompleteness(prisma, valid);
}

/**
 * Asks the SRI for each authorized document by its access key (the public
 * AutorizacionComprobantesOffline service returns received invoices too —
 * verified 4 oct 2026) and imports it like an uploaded XML. A few per call:
 * the browser sends the missing keys in small batches.
 */
export async function importSriKeys(sede: string, keys: string[]): Promise<SriOutcome[]> {
  const user = await requireEdit();
  if (sede !== "FITNESS_CENTER" && sede !== "XTREME") throw new Error("Elige la entidad.");
  const valid = [...new Set(keys)].filter(isValidAccessKey);
  if (valid.length === 0 || valid.length > 12) throw new Error("Envía entre 1 y 12 claves por lote.");

  const have = new Set(
    (await prisma.expense.findMany({ where: { sriAccessKey: { in: valid } }, select: { sriAccessKey: true } })).map((e) => e.sriAccessKey),
  );
  const one = async (key: string): Promise<SriOutcome> => {
    const base = { accessKey: key, issuerName: `Clave …${key.slice(-10)}`, docNumber: "", totalCents: 0 };
    if (have.has(key)) return { ...base, status: "duplicate", detail: "Ya estaba en la app." };
    let auth;
    try {
      auth = await checkAuthorization("PRODUCCION", key);
    } catch {
      // One retry: the SRI service is slow at times.
      try {
        auth = await checkAuthorization("PRODUCCION", key);
      } catch (err) {
        return { ...base, status: "rejected", detail: `El SRI no respondió: ${err instanceof Error ? err.message : "intenta de nuevo"}.` };
      }
    }
    if (auth.state !== "AUTORIZADO") {
      return { ...base, status: "rejected", detail: auth.state === "NO ENCONTRADO" ? "El SRI no la devolvió: súbela como XML." : `Estado en el SRI: ${auth.state}.` };
    }
    const xml = authorizedXml({ number: auth.number, date: auth.date, env: "PRODUCCION", signedXml: auth.signedXml });
    let doc;
    try {
      doc = parseSriXml(xml);
    } catch (err) {
      return { ...base, status: "rejected", detail: err instanceof Error ? err.message : "No se pudo leer el documento." };
    }
    try {
      const receiptPath = await storeSriXml(doc.accessKey, xml);
      return await prisma.$transaction((tx) => importSriDocument(tx, doc, { sede: sede as Sede, userId: user.id, receiptPath }));
    } catch (err) {
      return {
        accessKey: doc.accessKey, issuerName: doc.issuerName, docNumber: doc.docNumber, totalCents: doc.totalCents,
        status: "rejected", detail: err instanceof Error ? err.message : "No se pudo importar.",
      };
    }
  };

  // Four at a time: polite to the SRI, fast enough for a month of invoices.
  const out: SriOutcome[] = new Array(valid.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, valid.length) }, async () => {
      while (next < valid.length) {
        const i = next++;
        out[i] = await one(valid[i]);
      }
    }),
  );
  revalidatePath("/dashboard/finanzas", "layout");
  revalidatePath("/dashboard/gastos");
  return out;
}
