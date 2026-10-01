# Finanzas — Fase 1: reemplazar QuickBooks (diseño)

> Estado: **schema aprobado por Santiago (1 oct 2026). 1a implementada** (migración `20261001150000_finanzas_fase1` aplicada a prod).
> Aclaración de Santiago: con estados de cuenta + facturas del SRI llegan TODOS los gastos mayores;
> el registro manual es solo caja chica en efectivo (parqueadero, limpieza por horas, café).

## Objetivo

Que Isabel lleve la contabilidad de las dos sedes **dentro de la app**, sin ingresar nada dos
veces, separada por entidad legal, y que Santiago vea cada mes la utilidad o pérdida real de cada
sede. QuickBooks se cancela cuando un mes completo cuadre igual en los dos sistemas.

## Lo que encontramos en producción (1 oct 2026)

- **La tabla `Expense` está vacía.** La pestaña Contable existe, pero nunca se ha registrado un
  gasto: hoy la app solo conoce la mitad del estado de resultados.
- **Ingresos de Xtreme sin conciliar:** de mayo a septiembre, ~85–95 % de los pagos de Xtreme
  siguen `PENDING` (≈ $1,900–2,700/mes). El reporte actual solo suma `SUCCEEDED`, así que
  **subcuenta los ingresos de Xtreme**.
- 389 pagos `PENDING` en total (muchos arrastrados de la importación de HubSpot).
- Cuentas (Santiago, 1 oct): **Xtreme usa solo Banco del Pacífico**. La Fitness cobraba en
  Pichincha (de Isabel o de Santiago) y en Produbanco de Santiago; Santiago pidió que de ahora en
  adelante se deposite solo en **una** cuenta Pichincha suya.
- Tres formatos de estado de cuenta (verificados: el saldo corre continuo línea a línea):
  1. `PACIFICO` (`Movimientos_*.xlsx`: TipoMov N/C · N/D, Nut, Valor, SaldoDespMov,
     NombreOrdenante). La transferencia, su comisión y el IVA de la comisión comparten Nut.
  2. `PICHINCHA` ("Movimientos de Cuenta", `Movimientos_cuenta_*.xlsx`): dos filas por línea
     (documento en la segunda), montos `-$1.500,00`.
  3. `PRODUBANCO` (`ProdXXXX*.xlsx`: cabecera con CUENTA, luego FECHA/REFERENCIA/DESCRIPCION/+/-).

## Entidades legales

| Sede | Entidad | Tipo | Contabilidad formal |
|---|---|---|---|
| `FITNESS_CENTER` | Santiago Carrillo (RUC personal) | Persona natural, régimen por confirmar | Registro de ingresos y gastos |
| `XTREME` | La Cueva Xtreme S.A.S. | Sociedad | Sí: balance NIIF PYMES, Supercías |

Decisión: **entidad = sede** (1:1 hoy). Los datos legales (RUC, razón social, régimen) viven en
una constante `src/lib/finance/entities.ts`, no en una tabla nueva. **Todo gasto pertenece a una
entidad**: una factura se emite a un solo RUC. Los costos compartidos (software, publicidad) se
registran en la entidad que los pagó y, si se quiere, se reparten solo en la vista de gestión.

## Modelos (cambios al schema)

1. **`Expense` ampliado** (tabla vacía → sin migración de datos):
   `sede` obligatoria · `supplierName`, `supplierRuc` · `documentType` (FACTURA, NOTA_VENTA,
   LIQUIDACION_COMPRA, RECIBO, SIN_DOCUMENTO) · `documentNumber` · `sriAccessKey` (única;
   prepara la Fase 2) · `subtotalCents`, `ivaCents` (`amountCents` = total) · `paidAt`, `status`
   (PAID / PENDING = cuenta por pagar), `dueDate` · `receiptPath` (foto/PDF en Storage) ·
   `bankTransactionId` · `createdById`. Categorías nuevas: `BANK_FEES`, `INTEREST`.
2. **`CapitalMovement`** — el dinero que ponen o sacan los dueños, separado de los ingresos:
   `sede`, `person` (Santiago, Isabel, socio de Xtreme), `kind` = CONTRIBUTION (aporte para futura
   capitalización) · SHAREHOLDER_LOAN (préstamo del accionista a la empresa) · LOAN_REPAYMENT
   (la empresa le devuelve) · WITHDRAWAL (retiro del dueño), `amountCents`, `date`, `notes`,
   `bankTransactionId`. **Clave para Xtreme**: deja documentado cuánto ha puesto Santiago frente
   al 45 % del socio.
3. **`OtherIncome`** — ingresos que no son membresías: venta de Gatorade/suplementos, reembolsos,
   otros. `sede`, `category`, `amountCents`, `date`, `description`, `bankTransactionId`.
4. **`BankAccount`** — `sede`, `name`, `bank`, `last4`, `kind` (BUSINESS / PERSONAL_MIXED),
   `statementFormat` (GUAYAQUIL / PERSONAL / PRODUBANCO), `active`.
5. **`BankTransaction`** — una línea del estado de cuenta: `accountId`, `postedAt`,
   `amountCents` (con signo), `description`, `counterparty`, `reference`, `balanceCents`,
   `fingerprint` (único: reimportar el mismo archivo no duplica), `status` (PENDING /
   CLASSIFIED / IGNORED), `kind` (MEMBER_PAYMENT, OTHER_INCOME, EXPENSE, CAPITAL, CARD_SETTLEMENT,
   INTERNAL_TRANSFER, PERSONAL, LOAN_PAYMENT).
   `Payment` gana `bankTransactionId` (varios pagos pueden venir en una transferencia: Joselyn
   paga $80 por dos personas).
6. **`BankRule`** — reglas que aprende la clasificación: patrón de texto → tipo/categoría/sede
   (p. ej. "Pagoplux" → liquidación de tarjeta; múltiplos de $1.25 → Gatorade; "Srisece" → SRI).

## Pantallas — nueva sección `/dashboard/finanzas` (OWNER y ACCOUNTING)

1. **Resumen**: estado de resultados mensual por entidad (ingresos por membresías + otros
   ingresos − gastos por categoría = resultado), con "ingresos sin conciliar" visibles aparte;
   debajo, aportes/préstamos del mes y acumulados por persona; saldo de cada cuenta bancaria.
2. **Banco** (el corazón): subir el Excel del banco → bandeja de movimientos pendientes. Cada
   crédito sugiere el/los pagos `PENDING` que calzan (monto + nombre + fecha); cada débito sugiere
   gasto/aporte/personal según las reglas. Un clic confirma. En la cuenta personal mixta, lo
   personal se marca PERSONAL y no entra a la contabilidad.
3. **Gastos**: lista y registro manual (para efectivo), con foto de la factura y cuentas por pagar.
4. **Aportes y préstamos**: registro y saldo por persona y entidad.

## Plan de entrega

| PR | Contenido |
|---|---|
| **1a** ✅ | Schema (todo lo anterior) + Gastos + Aportes + Otros ingresos + Resumen por entidad (ingresos confirmados vs sin conciliar). Lógica en `src/lib/finance/queries.ts`; prueba de solo lectura `npm run test:finanzas`. |
| **1b** ✅ | Banco: importadores de los 3 formatos (`src/lib/finance/bank-parsers.ts`), bandeja con sugerencias (`bank-suggest.ts`: comisiones, SRI, IESS, Gatorade, dueños, pagos de socios por monto+nombre, uno que paga por dos, Pagoplux neto de comisión), clasificación con **deshacer exacto** (`appliedJson`) y reglas aprendidas. Un gasto del banco se enlaza a uno ya registrado (por pagar / SRI) del mismo monto en vez de duplicarlo. Pruebas: `npm run test:banco` (incluye clasificar/deshacer contra la BD real dentro de una transacción revertida). |
| **1c** | SRI comprobantes recibidos (adelantado desde la Fase 2: junto con el banco cubre todos los gastos mayores) + histórico de QuickBooks para comparar un mes en paralelo. |

## Fase 2 (después)

- **Ecuafact**: tiene API REST (plan Corporativo). Emitir la factura automáticamente al
  confirmarse un pago. Requiere cotizar el plan y credenciales.
- **SRI — comprobantes recibidos**: descargar el listado de facturas de proveedores y su XML por
  clave de acceso → los gastos se cargan solos con IVA. Resumen para el formulario 104 y ATS.
- **Préstamos bancarios**: separar capital (no es gasto) de intereses (gasto) en cada cuota.

## Fase 3

Libro diario y balance de la S.A.S. (NIIF PYMES) generados desde estos registros, para que
Isabel prepare y Vinicio firme los estados financieros de Supercías.

## Preguntas abiertas

1. ¿Qué cuentas bancarias existen y de qué entidad es cada una? (Guayaquil = ¿Xtreme?, cuenta
   personal = Fitness, Produbanco = ¿liquidaciones Plux / personal?)
2. Isabel: ¿qué reportes saca hoy de QuickBooks que no pueden faltar?
3. Cuotas de los préstamos bancarios de Xtreme: ¿quién las paga y desde qué cuenta?
