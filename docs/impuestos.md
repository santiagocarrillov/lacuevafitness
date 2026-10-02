# Impuestos: formulario 104 (IVA) y ATS

Hecho el 2 oct 2026. Finanzas → Impuestos (mes seleccionado). Código: `src/lib/taxes/`.

## Formulario 104 (ambas entidades)

Casilleros según la guía oficial del SRI ("Guía para el llenado del Formulario IVA"):

| Casillero | Qué | De dónde sale |
|---|---|---|
| 401/411 · 421 | Ventas locales gravadas 15 % y su IVA | Facturas de la app + cobros sin factura de la app (Ecuafact durante la transición) + ventas de productos — los mismos documentos que el libro diario; el IVA cuadra con 2.1.06 |
| 500/510 · 520 | Compras con crédito tributario y su IVA | Gastos con factura o liquidación de compra con IVA |
| 507/517 | Compras tarifa 0 % | Parte 0 % de esas facturas |
| 508/518 | Compras a negocios populares | Notas de venta (total) |
| 564 | Crédito aplicable | Factor de proporcionalidad 1 (todo lo vendido es gravado) |
| 605 → 615 | Saldo de crédito del mes anterior → para el próximo | Se arrastra desde enero 2026 (Xtreme abre con 1.3.01 = $108,25) |
| 601/699 | IVA a pagar | 421 − 520 − 605, si es positivo |

Recibos y gastos sin documento no van al 104. Es un borrador: Isabel lo compara con lo emitido en Ecuafact
y con el 615 declarado el mes anterior antes de declarar.

## ATS (solo Xtreme, sociedad)

XML mensual para el DIMM (`AT{MM}{AAAA}.xml`), validado contra `scripts/fixtures/sri-xsd/ats.xsd`
(esquema ATS del SRI, versión de abr 2026, tomado de un repositorio público de Odoo Ecuador).

- Xtreme **no es agente de retención**: todos los campos de retención en 0.00, sin detalle AIR.
- Las facturas **electrónicas de venta no se reportan** en el módulo de ventas (regla del SRI); como todas
  las ventas son electrónicas, ventas y anulados van vacíos y `ventasEstab` = 0.00.
- Compras: una línea por factura, nota de venta o liquidación con RUC y número. Sustento 01 (crédito de
  IVA), 03 (activo fijo) o 02 (sin crédito: notas de venta, tarifa 0). Compras incompletas (sin RUC o número)
  se listan para corregirlas en Gastos.
- **Verificar en el DIMM** el primer mes: la validación de negocio del SRI es más estricta que el XSD
  (p. ej. si exige AIR con código 332 para no agentes de retención).

Tests: `npm run test:impuestos` (datos reales 2026, solo lectura + caso sintético con compras).
