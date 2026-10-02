/**
 * Cliente de los web services del SRI (Módulo 2b).
 *  - consulta REAL de solo lectura al ambiente de pruebas (clave inexistente)
 *  - respuestas simuladas de Recepción/Autorización con el formato del SRI
 *    (RECIBIDA, DEVUELTA, clave ya registrada, AUTORIZADO con CDATA)
 * No envía comprobantes al SRI.
 *
 * Uso:  npx tsx scripts/test-sri-ws.ts
 */
import { authorizedXml, checkAuthorization, sendToSri } from "../src/lib/invoicing/sri-ws";
import { parseSriXml } from "../src/lib/finance/sri-xml";
import { buildAccessKey, buildInvoiceXml } from "../src/lib/invoicing/xml";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const env = (body: string, ns: string) =>
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body.replace(/NS/g, ns)}</soap:Body></soap:Envelope>`;
const realFetch = globalThis.fetch;
function mock(text: string) {
  globalThis.fetch = (async () => new Response(text, { status: 200 })) as typeof fetch;
}

(async () => {
  const key = buildAccessKey({ issueDate: new Date("2026-10-02T00:00:00Z"), ruc: "1793142958001", environment: "PRUEBAS", establishment: "001", point: "100", sequential: 1 });

  const real = await checkAuthorization("PRUEBAS", key);
  check("consulta real a celcer.sri.gob.ec responde (clave inexistente → no encontrada)", real.state === "NO ENCONTRADO", real.state);

  mock(env(`<ns2:validarComprobanteResponse xmlns:ns2="NS"><RespuestaRecepcionComprobante><estado>RECIBIDA</estado><comprobantes/></RespuestaRecepcionComprobante></ns2:validarComprobanteResponse>`, "http://ec.gob.sri.ws.recepcion"));
  const r1 = await sendToSri("PRUEBAS", "<factura/>");
  check("Recepción RECIBIDA", r1.state === "RECIBIDA" && !r1.alreadyReceived);

  mock(env(`<ns2:validarComprobanteResponse xmlns:ns2="NS"><RespuestaRecepcionComprobante><estado>DEVUELTA</estado><comprobantes><comprobante><claveAcceso>${key}</claveAcceso><mensajes><mensaje><identificador>35</identificador><mensaje>ARCHIVO NO CUMPLE ESTRUCTURA XML</mensaje><informacionAdicional>detalle</informacionAdicional><tipo>ERROR</tipo></mensaje></mensajes></comprobante></comprobantes></RespuestaRecepcionComprobante></ns2:validarComprobanteResponse>`, "http://ec.gob.sri.ws.recepcion"));
  const r2 = await sendToSri("PRUEBAS", "<factura/>");
  check("Recepción DEVUELTA con mensaje legible", r2.state === "DEVUELTA" && !r2.alreadyReceived && r2.messages[0]?.id === "35" && r2.messages[0]?.info === "detalle", JSON.stringify(r2.messages));

  mock(env(`<ns2:validarComprobanteResponse xmlns:ns2="NS"><RespuestaRecepcionComprobante><estado>DEVUELTA</estado><comprobantes><comprobante><mensajes><mensaje><identificador>43</identificador><mensaje>CLAVE ACCESO REGISTRADA</mensaje><tipo>ERROR</tipo></mensaje></mensajes></comprobante></comprobantes></RespuestaRecepcionComprobante></ns2:validarComprobanteResponse>`, "http://ec.gob.sri.ws.recepcion"));
  check("clave ya registrada (43) → se pasa a consultar autorización", (await sendToSri("PRUEBAS", "<factura/>")).alreadyReceived);

  const inner = buildInvoiceXml({ sede: "XTREME", environment: "PRUEBAS", establishment: "001", point: "100", establishmentAddress: "X", sequential: 1, accessKey: key, issueDate: new Date("2026-10-02T00:00:00Z"), buyerIdType: "05", buyerId: "1707994461", buyerName: "Prueba", payForm: "01", lines: [{ code: "M", description: "Membresía", quantity: 1, unitPriceCents: 5000, ivaRate: 15 }] });
  mock(env(`<ns2:autorizacionComprobanteResponse xmlns:ns2="NS"><RespuestaAutorizacionComprobante><claveAccesoConsultada>${key}</claveAccesoConsultada><numeroComprobantes>2</numeroComprobantes><autorizaciones><autorizacion><estado>NO AUTORIZADO</estado><mensajes><mensaje><identificador>39</identificador><mensaje>FIRMA INVALIDA</mensaje></mensaje></mensajes></autorizacion><autorizacion><estado>AUTORIZADO</estado><numeroAutorizacion>${key}</numeroAutorizacion><fechaAutorizacion>2026-10-02T10:15:30-05:00</fechaAutorizacion><ambiente>PRUEBAS</ambiente><comprobante><![CDATA[${inner}]]></comprobante><mensajes/></autorizacion></autorizaciones></RespuestaAutorizacionComprobante></ns2:autorizacionComprobanteResponse>`, "http://ec.gob.sri.ws.autorizacion"));
  const a = await checkAuthorization("PRUEBAS", key);
  check("Autorización: gana el intento AUTORIZADO", a.state === "AUTORIZADO");
  if (a.state === "AUTORIZADO") {
    check("fecha de autorización con zona horaria", a.date.toISOString() === "2026-10-02T15:15:30.000Z", a.date.toISOString());
    const stored = authorizedXml({ number: a.number, date: a.date, env: "PRUEBAS", signedXml: a.signedXml });
    const back = parseSriXml(stored);
    check("el XML autorizado que guardamos lo lee el importador", back.accessKey === key && back.totalCents === 5000);
  }

  mock(env(`<ns2:autorizacionComprobanteResponse xmlns:ns2="NS"><RespuestaAutorizacionComprobante><autorizaciones><autorizacion><estado>NO AUTORIZADO</estado><mensajes><mensaje><identificador>39</identificador><mensaje>FIRMA INVALIDA</mensaje></mensaje></mensajes></autorizacion></autorizaciones></RespuestaAutorizacionComprobante></ns2:autorizacionComprobanteResponse>`, "http://ec.gob.sri.ws.autorizacion"));
  const n = await checkAuthorization("PRUEBAS", key);
  check("NO AUTORIZADO con el motivo", n.state === "NO AUTORIZADO" && n.messages[0]?.message === "FIRMA INVALIDA");

  globalThis.fetch = realFetch;
  console.log(fallos ? `\n❌ ${fallos} fallo(s)` : "\n✅ Todo bien");
  process.exit(fallos ? 1 : 0);
})();
