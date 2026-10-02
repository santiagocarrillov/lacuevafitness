// SRI offline web services (server only): Recepción + Autorización.
// Pruebas: celcer.sri.gob.ec · Producción: cel.sri.gob.ec

import { XMLParser } from "fast-xml-parser";
import type { SriEnvironment } from "@/generated/prisma/enums";

const HOSTS: Record<SriEnvironment, string> = {
  PRUEBAS: "https://celcer.sri.gob.ec",
  PRODUCCION: "https://cel.sri.gob.ec",
};
const PATH = "/comprobantes-electronicos-ws";

export type SriMessage = { id: string; message: string; info?: string; type?: string };

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ["comprobante", "mensaje", "autorizacion"].includes(name),
});

type Node = Record<string, unknown>;
const obj = (v: unknown): Node => (v && typeof v === "object" ? (v as Node) : {});
const arr = (v: unknown): Node[] => (Array.isArray(v) ? v.map(obj) : v ? [obj(v)] : []);
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

function messages(v: unknown): SriMessage[] {
  return arr(obj(v).mensaje).map((m) => ({
    id: s(m.identificador),
    message: s(m.mensaje),
    info: s(m.informacionAdicional) || undefined,
    type: s(m.tipo) || undefined,
  }));
}

async function soap(env: SriEnvironment, service: string, ns: string, body: string, timeoutMs = 30_000) {
  const res = await fetch(`${HOSTS[env]}${PATH}/${service}`, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="${ns}"><soapenv:Header/><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok && !text.includes("Envelope")) throw new Error(`El SRI respondió ${res.status}.`);
  return obj(obj(parser.parse(text)).Envelope).Body as Node;
}

export type ReceptionResult = { state: "RECIBIDA" | "DEVUELTA"; messages: SriMessage[]; alreadyReceived: boolean };

/** Sends the signed XML. "DEVUELTA" with error 43/70 means the SRI already has it. */
export async function sendToSri(env: SriEnvironment, signedXml: string): Promise<ReceptionResult> {
  const b64 = Buffer.from(signedXml, "utf8").toString("base64");
  const body = await soap(env, "RecepcionComprobantesOffline", "http://ec.gob.sri.ws.recepcion", `<ec:validarComprobante><xml>${b64}</xml></ec:validarComprobante>`);
  const r = obj(obj(body.validarComprobanteResponse).RespuestaRecepcionComprobante);
  const state = s(r.estado);
  if (state !== "RECIBIDA" && state !== "DEVUELTA") throw new Error("Respuesta inesperada de Recepción del SRI.");
  const msgs = arr(obj(r.comprobantes).comprobante).flatMap((c) => messages(c.mensajes));
  // 43 = CLAVE ACCESO REGISTRADA · 70 = CLAVE DE ACCESO EN PROCESAMIENTO
  const alreadyReceived = state === "DEVUELTA" && msgs.some((m) => m.id === "43" || m.id === "70");
  return { state, messages: msgs, alreadyReceived };
}

export type AuthorizationResult =
  | { state: "AUTORIZADO"; number: string; date: Date; signedXml: string; messages: SriMessage[] }
  | { state: "NO AUTORIZADO"; messages: SriMessage[] }
  | { state: "EN PROCESO" | "NO ENCONTRADO"; messages: SriMessage[] };

export async function checkAuthorization(env: SriEnvironment, accessKey: string): Promise<AuthorizationResult> {
  const body = await soap(
    env,
    "AutorizacionComprobantesOffline",
    "http://ec.gob.sri.ws.autorizacion",
    `<ec:autorizacionComprobante><claveAccesoComprobante>${accessKey}</claveAccesoComprobante></ec:autorizacionComprobante>`,
  );
  const r = obj(obj(body.autorizacionComprobanteResponse).RespuestaAutorizacionComprobante);
  const list = arr(obj(r.autorizaciones).autorizacion);
  if (!list.length) return { state: "NO ENCONTRADO", messages: [] };
  // If the SRI holds several attempts, an authorized one wins.
  const a = list.find((x) => s(x.estado) === "AUTORIZADO") ?? list[0];
  const msgs = messages(a.mensajes);
  const state = s(a.estado);
  if (state === "AUTORIZADO") {
    return { state, number: s(a.numeroAutorizacion) || accessKey, date: new Date(s(a.fechaAutorizacion)), signedXml: s(a.comprobante), messages: msgs };
  }
  if (state === "NO AUTORIZADO") return { state, messages: msgs };
  return { state: "EN PROCESO", messages: msgs };
}

/** The authorized document as the SRI delivers it to the buyer. */
export function authorizedXml(p: { number: string; date: Date; env: SriEnvironment; signedXml: string }) {
  const comprobante = p.signedXml.replace(/^<\?xml[^>]*\?>/, "");
  return (
    `<?xml version="1.0" encoding="UTF-8"?><autorizacion><estado>AUTORIZADO</estado>` +
    `<numeroAutorizacion>${p.number}</numeroAutorizacion><fechaAutorizacion>${p.date.toISOString()}</fechaAutorizacion>` +
    `<ambiente>${p.env === "PRUEBAS" ? "PRUEBAS" : "PRODUCCIÓN"}</ambiente>` +
    `<comprobante><![CDATA[${comprobante}]]></comprobante><mensajes/></autorizacion>`
  );
}
