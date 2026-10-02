# Módulo 3 — Gastos al estilo QuickBooks con lectura del comprobante por IA

Aprobado por Santiago el 2 oct 2026. Contexto contable: `docs/contabilidad-libro-diario.md`.

## Decisiones

- Un gasto tiene **líneas**, cada una a su cuenta de **gasto o activo** (equipos, instalaciones, arriendo
  anticipado). Los gastos anteriores (sin líneas) se contabilizan por su categoría, como antes; al editarlos
  se dividen en líneas.
- Se sube la **foto o el PDF** del comprobante y Claude (`claude-opus-5-5`, salida estructurada) llena
  proveedor, RUC, tipo y número, clave de acceso, fecha, forma de pago, líneas con su cuenta e IVA. La
  persona revisa y guarda. Si el proveedor ya tiene gastos, se reutiliza su cuenta. Avisos: duplicado
  (clave de acceso o proveedor + número), factura a nombre de otra entidad o de nadie, líneas que no suman.
- Solo **factura y liquidación de compra** dan crédito de IVA; en notas de venta, recibos y sin documento el
  IVA se suma al costo.
- **Admins de sede** (Santiago, 2 oct): registran todos los gastos de su sede (caja chica, bebidas,
  magnesio, arreglos, equipos, construcción…) **excepto sueldos y pagos a coaches**, que tampoco ven.
  Las cuentas 5.2.x (5.2.01 Sueldos, 5.2.02 Honorarios de coaches, nueva) son privadas
  (`Expense.isPrivate`). Lo que registra un admin queda **por revisar** (`reviewedAt`) hasta que Isabel o
  Santiago lo revisan; mientras tanto el admin puede corregirlo o anularlo.
- Contabilidad: Dr cada línea a su cuenta · Dr 1.3.01 IVA crédito · Cr 2.1.01 Proveedores; el pago como antes.

## Dónde está

- `src/lib/expenses/core.ts` (reglas), `src/lib/expenses/ocr.ts` (lectura con IA), `src/lib/actions/expenses.ts`.
- `/dashboard/gastos` (lista por mes, “por revisar”), `/nuevo` y `/[id]` (editor de pantalla completa).
- Migración `20261002200000_gastos_lineas` (aplicada): `ExpenseLine`, `isPrivate`, `reviewedAt`,
  categoría `COACH_FEES`; los gastos anteriores quedan revisados y los de sueldos, privados.
- Tests: `npm run test:gastos`.

## Pendiente

- La lectura con IA no se probó con un comprobante real (no hay API key local); usa `ANTHROPIC_API_KEY`
  de Vercel (la misma del bot). Probarla con 3–4 comprobantes reales (factura, nota de venta, recibo a mano).
- El Estado de resultados de Finanzas (vista de gestión) agrupa por categoría de cabecera; Contabilidad sí
  usa la cuenta de cada línea (un equipo comprado va al activo).

## Activos fijos y depreciación (2 oct 2026, aprobado por Santiago)

- Registro `FixedAsset` (Contabilidad → Activos fijos). Línea recta, **10 % anual (120 meses)** por defecto,
  como en los EEFF 2025 (art. 28 del reglamento LRTI); la vida útil y el residual se cambian por activo.
- Activos de Xtreme al 31-dic-2025 (Nota 7): 3 grupos con la depreciación acumulada de $6.459,16 repartida
  por costo (`npm run db:seed:activos-xtreme -- --write`, ya corrido): ≈ $206,07/mes desde enero 2026.
- Compras en Gastos a 1.2.01/1.2.02/1.2.03 aparecen como “por registrar”; con un clic entran al registro
  y empiezan a depreciarse el mes siguiente.
- Asiento automático (fuente DEPRECIATION) el último día de cada mes: Dr 5.3.10 por activo · Cr 1.2.09.
  Baja (robo, daño, venta): Dr 1.2.09 lo acumulado + Dr 5.3.99 la pérdida · Cr la cuenta del activo al costo;
  deprecia hasta el mes anterior a la baja.
- Tests: `npm run test:depreciacion`.
