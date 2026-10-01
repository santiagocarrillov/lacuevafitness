"use server";

// Finanzas 1c — SRI received invoices: import the authorized XML files and
// check the SRI "recibidos" report for invoices not loaded yet.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import { storeSriXml } from "@/lib/storage/upload";
import type { Sede } from "@/generated/prisma/client";
import { extractAccessKeys, parseSriXml } from "@/lib/finance/sri-xml";
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
  revalidatePath("/dashboard/finanzas");
  return out;
}

/** Reads the SRI "Comprobantes recibidos" report (any text format) by its access keys. */
export async function checkSriReport(fd: FormData): Promise<CompletenessReport> {
  await requireEdit();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Elige el reporte del SRI.");
  if (file.size > 1024 * 1024) throw new Error("El reporte pesa más de 1 MB: descarga un mes a la vez.");
  const keys = extractAccessKeys(await file.text());
  if (keys.length === 0) throw new Error("No encontré claves de acceso en el archivo.");
  return checkCompleteness(prisma, keys);
}
