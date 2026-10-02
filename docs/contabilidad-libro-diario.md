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
| **1b** ✅ | Contabilización automática (`src/lib/accounting/posting.ts`), reglas abajo; cierre de mes con bloqueo; pruebas `npm run test:contabilizacion` (datos reales 2026 en transacción revertida). |
| 2 | Facturación en pantalla completa + **emisión directa al SRI** (empezar por ambiente de pruebas). |
| 3 | Gastos al estilo QuickBooks con lectura del comprobante por IA; línea por cuenta (gasto o activo). |
| 4 | Nómina privada (rol, IESS, provisiones) y liquidaciones de compra electrónicas. |

## Para la emisión directa (módulo 2) se necesita

- Firma electrónica **.p12 de cada entidad** (persona natural de Santiago y la de la S.A.S. como
  persona jurídica) y su clave. Santiago la carga como secreto en Vercel: Claude no maneja la clave.
- Habilitar el **ambiente de pruebas** de facturación electrónica en SRI en Línea para cada RUC.
- Definir el **establecimiento y punto de emisión** para la app (distinto del que usa Ecuafact) y
  el último secuencial emitido, para no chocar numeración durante la transición.

## Reglas de contabilización automática (1b)

Los documentos son la fuente. Al abrir Contabilidad (y al cerrar un mes) se sincroniza el libro: lo
que no cambió se queda, lo que cambió se anula y se vuelve a contabilizar, y lo de documentos anulados
se anula. **Nunca se toca un mes cerrado:** esos cambios se reportan para ajustarlos en el mes abierto.

| Documento | Asiento |
|---|---|
| **Cobro** (Payment SUCCEEDED/PENDING; depósito sin asignar PENDING) | Dr banco (si está conciliado), Caja (efectivo) o **1.1.05 Cuenta puente** · Cr 2.1.06 IVA (15 % incluido) · Cr 4.1.01 Mensualidades / 4.1.02 Evaluaciones y pases (trial y pase diario) |
| **Prepago de varios meses** | El primer mes va a ingresos y el resto a 2.1.07 Ingresos diferidos; el 1.º de cada mes siguiente se reconoce una cuota. **Las membresías con compromiso pagadas en cuotas (p. ej. $40 de un anual de $480) NO se difieren:** solo se difiere si el pago cubre 2+ meses del contrato. |
| **Otro ingreso** | Dr banco/Caja · venta de productos con IVA → 4.1.03; reembolsos → 4.2.02 y otros → 4.2.01, sin IVA |
| **Gasto** | Devengo en la fecha del documento: Dr gasto (por categoría) + Dr 1.3.01 IVA crédito · Cr 2.1.01 Proveedores. Al pagarse: Dr 2.1.01 · Cr banco (conciliado), Caja (efectivo), 2.1.09 tarjeta de crédito o 1.1.05 Cuenta puente |
| **Dueños** | Préstamo de accionista: Dr banco/puente · Cr 2.2.01 (tercero = persona). Devolución: al revés. Aporte o retiro: contra 3.1.02 |

- La **cuenta puente 1.1.05** recoge todo lo que aún no se cruza con una línea del banco. Al conciliar,
  el documento queda enlazado y su asiento pasa solo a la cuenta bancaria real.
- Los pagos de 2025 están en la apertura (los EEFF firmados no tienen ingresos diferidos): solo se
  contabiliza desde el día siguiente a la apertura.
- Pendiente: el capital de las cuotas de préstamos bancarios y las transferencias entre cuentas propias
  (por ahora se clasifican en el banco sin asiento).
