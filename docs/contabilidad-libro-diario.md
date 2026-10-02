# Contabilidad — libro diario de partida doble (diseño)

> Aprobado por Santiago el 1 oct 2026. Reemplaza al balance que sumaba registros por separado
> (`src/lib/finance/ledger.ts`, que mostraba una "diferencia por cuadrar"). Con el libro diario,
> los reportes salen de un solo lugar y el balance cuadra por construcción.

## Principio

Todo hecho económico termina en un **asiento** (débitos = créditos). Los **documentos** (factura,
cobro, gasto, préstamo de socio, línea del banco) son la fuente y generan su asiento
automáticamente. El **asiento manual** queda para Isabel y los casos raros. Los **reportes** (estado
de situación, resultados, mayor, balance de comprobación) leen solo del libro diario.

## Decisiones (Santiago, 1 oct 2026)

1. **Precios con IVA incluido.** Un cobro de $50 = $43,48 de ingreso + $6,52 de IVA (15 %).
2. **Se factura al cobrar, por el total cobrado.** La LRTI (art. 61) permite elegir como hecho
   generador del IVA en servicios el **pago** total o parcial; se elige el pago. El IVA cobrado se
   declara y paga ese mes: nunca queda IVA por pagar de algo no cobrado, y no se factura a un socio
   atrasado que no ha pagado.
3. **Ingreso contable devengado (NIIF):** un prepago de varios meses se factura entero (IVA ese
   mes), pero el ingreso se reconoce mes a mes:
   - Al cobrar $240 de un semestre: Dr Banco 240 · Cr IVA por pagar 31,30 · Cr Ingresos diferidos 208,70.
   - Cada mes: Dr Ingresos diferidos 34,78 · Cr Ingresos por mensualidades 34,78 (asiento automático).
   - Planes mensuales: se reconocen al cobrar (inmaterial diferirlos días).
   - Socio atrasado que usa el servicio sin pagar: no hay ingreso ni cuenta por cobrar hasta que
     pague. Coherente con NIIF 15, que exige que el cobro sea probable.
4. **Emisión electrónica directa al SRI** (opción a: firma .p12 de cada entidad, XML + firma
   XAdES-BES, web services de recepción y autorización del SRI). Se deja de usar Ecuafact.
5. **Formularios guiados que generan el asiento correcto** (préstamo de socio, compra de activo,
   pago de préstamo) en vez de pedir débitos y créditos para lo común.

## Modelo

- `LedgerAccount` (ya existe) + `parentId` y `postable`: plan de cuentas jerárquico por entidad.
  Solo las cuentas de detalle (`postable`) reciben movimientos.
- `JournalEntry`: entidad, número correlativo por entidad, fecha, descripción, `source`
  (OPENING, MANUAL, PAYMENT, EXPENSE, CAPITAL, OTHER_INCOME, BANK, DEFERRED_REVENUE, DEPRECIATION,
  ACCRUAL, PAYROLL, INVOICE), `sourceId`, estado POSTED/VOIDED. Nunca se borra: se anula.
- `JournalLine`: cuenta, débito o crédito en centavos, glosa y **tercero** (`party`: socio,
  proveedor, accionista o empleado). Por ejemplo, el saldo de "Préstamos de accionistas" por
  persona sale del tercero.
- (Módulo 1b) `PeriodClose`: mes cerrado = bloqueado.

## Entregas

| # | Contenido |
|---|---|
| **1a** ✅ | Schema; plan de cuentas de ambas entidades (cuentas de los EEFF 2025 + IVA, ingresos diferidos, ingresos y gastos); asiento de apertura desde los saldos firmados; asientos manuales (validación débito = crédito, anulación); reportes desde el libro diario: libro diario, mayor por cuenta, balance de comprobación, estado de situación y de resultados. Plan de cuentas y apertura cargados en prod (`npm run db:seed:contabilidad -- --write`); pruebas `npm run test:contabilidad`. |
| **1b** | Contabilización automática de lo que ya existe: cobros (IVA incluido, diferido según el plan), otros ingresos, gastos (con IVA y por pagar), préstamos y aportes, banco; reconocimiento mensual de diferidos; cierre de mes. |
| 2 | Facturación en pantalla completa + **emisión directa al SRI** (empezar por ambiente de pruebas). |
| 3 | Gastos al estilo QuickBooks con lectura del comprobante por IA; línea por cuenta (gasto o activo). |
| 4 | Nómina privada (rol, IESS, provisiones) y liquidaciones de compra electrónicas. |

## Para la emisión directa (módulo 2) se necesita

- Firma electrónica **.p12 de cada entidad** (persona natural de Santiago y la de la S.A.S. como
  persona jurídica) y su clave. Santiago la carga como secreto en Vercel: Claude no maneja la clave.
- Habilitar el **ambiente de pruebas** de facturación electrónica en SRI en Línea para cada RUC.
- Definir el **establecimiento y punto de emisión** para la app (distinto del que usa Ecuafact) y
  el último secuencial emitido, para no chocar numeración durante la transición.
