# Módulo 2 — Facturación en pantalla completa + emisión directa al SRI

Contexto contable: `docs/contabilidad-libro-diario.md`. Schema aprobado por Santiago el 1 oct 2026
(régimen general; la transferencia se factura al registrar el cobro). **2a hecha** (migración
`20261002100000_facturacion` aplicada): ver "Estado" al final.

## Qué decidió Santiago

- Los precios incluyen IVA 15 %.
- Se factura **al cobrar**, por el total cobrado. El IVA se paga ese mes.
- Emisión **directa al SRI** con la firma .p12 de cada entidad (adiós Ecuafact).
- La factura se hace en una **pantalla completa que se ve como una factura** (no un popup) y sirve
  para membresías, evaluaciones, bebidas, etc.

## Reglas del SRI que cambian el diseño

- **Consumidor final solo hasta USD 50 con IVA** (régimen general y RIMPE emprendedor). Una
  mensualidad de $60 **no** puede ir a consumidor final: hay que pedir la cédula o el RUC.
  → El socio necesita un campo de identificación.
- Desde el 1 ene 2026 una factura a consumidor final **no se puede anular ni corregir con nota de
  crédito** (Res. NAC-DGERCGC25-00000017). → La pantalla debe avisarlo antes de emitir.
- Ficha técnica vigente: esquema offline v2.34 (jul 2026). Si la entidad es RIMPE, el XML lleva la
  leyenda `contribuyenteRimpe`. → Hay que confirmar el régimen de Santiago persona natural.

## Flujo de emisión (offline, dos web services)

1. Se arma el XML `factura` v1.1.0 con la clave de acceso de 49 dígitos (ya implementada:
   `src/lib/finance/sri-xml.ts`).
2. Se firma con XAdES-BES usando la .p12 de la entidad (secreto en Vercel).
3. **Recepción** (`RecepcionComprobantesOffline`): el SRI responde RECIBIDA o DEVUELTA (con errores).
4. **Autorización** (`AutorizacionComprobantesOffline`): AUTORIZADO o NO AUTORIZADO. Puede tardar;
   si queda "en proceso", un reintento (botón y cron) vuelve a consultar.
5. XML autorizado → bucket privado `finance-docs`. Se genera el **RIDE** (PDF) y se manda por correo
   al cliente (Resend).

Pruebas: `celcer.sri.gob.ec` · Producción: `cel.sri.gob.ec`. Empezamos en pruebas.

## Modelo de datos propuesto (para aprobar)

**Member** (2 campos nuevos, opcionales):
- `taxIdType` — CEDULA · RUC · PASAPORTE.
- `taxId` — el número. Sin él, solo se puede facturar a consumidor final (≤ $50).

**SaleItem** (catálogo de lo que se vende que NO es membresía; las membresías siguen en
`MembershipPlan`): nombre, precio con IVA, si lleva IVA, tipo (servicio / bien), cuenta de ingreso
(4.1.02 evaluaciones, 4.1.03 bebidas…), sede o ambas, activo.

**EmissionPoint**: entidad, establecimiento (`001`), punto de emisión (`00X`), último secuencial,
ambiente (pruebas / producción). Numeración atómica por punto.

**Invoice**: entidad, punto de emisión, secuencial, clave de acceso (única), fecha, **copia del
comprador** (tipo y número de identificación, nombre, correo, dirección — una factura no cambia si
luego se edita el socio), subtotal, IVA, total, forma de pago SRI, estado (BORRADOR · ENVIADA ·
AUTORIZADA · DEVUELTA/RECHAZADA · ANULADA), mensajes del SRI, fecha y número de autorización, ruta
del XML autorizado, cuándo se envió el correo.

**InvoiceLine**: descripción, cantidad, precio unitario sin IVA, descuento, tarifa de IVA, total y
qué se vendió (membresía → `membershipId`, o `saleItemId`).

**Payment.invoiceId** (nuevo, opcional): el cobro que respalda la factura.

## Contabilidad: sin doble registro

Hoy el ingreso sale de `Payment` (fuente PAYMENT). Con facturas:

- Una factura autorizada genera el asiento de ingreso (fuente INVOICE): Dr cuenta del cobro
  (banco conciliado, caja o puente 1.1.05) · Cr IVA por pagar · Cr ingreso de cada línea, con la
  misma regla de diferidos (solo se difiere un pago que cubre 2+ meses del contrato).
- Un `Payment` con `invoiceId` **deja de generar** su propio asiento (lo cubre la factura).
- Los pagos viejos sin factura siguen como hoy. "Otros ingresos" queda para lo que no lleva factura
  (reembolsos).

## Pantalla

`/dashboard/facturar` (página completa). Arriba los datos del emisor y del cliente (buscar socio
o escribir cédula/RUC); al medio las líneas (membresía del socio, catálogo o línea libre); abajo
subtotal, IVA 15 %, total; a la derecha cómo pagó (efectivo, transferencia, tarjeta → forma de pago
SRI + datos del banco). Un botón **Cobrar y facturar** crea el pago y la factura juntos; la factura
se envía al SRI en el acto y el estado se ve en la misma pantalla. El popup actual de registrar pago
y la pestaña Otros ingresos pasan a abrir esta pantalla.

## Orden de trabajo

1. **2a (sin firma):** schema + catálogo + pantalla + XML + numeración; las facturas quedan en
   BORRADOR y se puede ver el XML. Contabilidad por factura.
2. **2b (con la .p12):** firma XAdES-BES + recepción/autorización en **pruebas** + RIDE + correo.
3. **2c:** pasar a producción con un punto de emisión propio; notas de crédito.

## Lo que falta de Santiago (bloquea solo la emisión, no la 2a)

1. Firma **.p12 de cada entidad** (la suya para la Fitness; la de la S.A.S. para Xtreme). Él la sube y
   pone la clave como variable en Vercel; Claude nunca maneja la clave.
2. **Ambiente de pruebas** habilitado en SRI en Línea para 1707994461001 y 1793142958001.
3. Establecimiento y punto de emisión que usa Ecuafact hoy y su último secuencial, para darle a la
   app un punto propio sin chocar numeración.
4. Régimen de Santiago persona natural (general o RIMPE) y si está obligado a llevar contabilidad:
   ambos van impresos en el XML.

## Estado (2a, 2 oct 2026)

- Código: `src/lib/invoicing/` (cálculo, cédula/RUC, clave de acceso, XML), `src/lib/actions/invoicing.ts`,
  `src/app/dashboard/facturas/` (lista, configuración, `nueva` = pantalla completa, `[id]` = factura y XML).
- El XML generado **valida contra el XSD oficial** `factura_V1.1.0` (`scripts/fixtures/sri-xsd/`).
- Contabilidad: fuente INVOICE; un `Payment` con factura vigente no genera asiento propio; al anular la
  factura el cobro vuelve a contabilizarse solo y se puede refacturar desde Pagos (“facturar”).
- Un cobro con factura vigente no se puede borrar ni cambiar de monto en Pagos.
- Solo OWNER/ACCOUNTING mientras sea borrador de pruebas. Tests: `npm run test:facturacion`.
- IVA con precios que lo incluyen: se usa el mismo redondeo del libro (`splitIva`); la diferencia contra
  base × 15 % es < 0,6 centavos en todos los montos (tolerancia del SRI: 1 centavo). Confirmar en pruebas.

**Falta para 2b:** la .p12 de cada entidad, ambiente de pruebas, la dirección matriz de cada RUC
(`ENTITIES.matrixAddress`, hoy se usa la del establecimiento) y confirmar si la persona natural está
obligada a llevar contabilidad (hoy NO).
