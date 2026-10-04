# Contabilidad v2 — "QuickBooks para gimnasios en Ecuador"

Rediseño pedido por Santiago el 4 oct 2026. Objetivo doble:

1. Que la contabilidad de La Cueva sea fácil de usar (fondo blanco, colores en reportes y gráficos,
   íconos en los menús, portada con el flujo de trabajo como QuickBooks Desktop).
2. Pensarla como **producto**: otro gimnasio de Ecuador debería poder usarla con un cambio pequeño
   (sus empresas, su RUC, sus bancos, su plan de cuentas), no reescribiendo código.

## Módulos (fase 1, PR de este rediseño)

| Módulo | Qué contiene | Pantallas |
|---|---|---|
| **Inicio** | Flujo de trabajo por carriles con contadores de pendientes; tarjetas de P&G, ingresos y gastos (dona), flujo de 12 meses, bancos (saldo banco vs. libros), obligaciones SRI, por pagar, dinero de los dueños. Vista **Consolidado / por empresa**. | `/dashboard/finanzas` |
| **Clientes** | Socios y ventas: cobros, facturas SRI, otros ingresos, catálogo y puntos de emisión. Resumen con ventas por plan y forma de pago. | `/dashboard/finanzas/clientes`, `/dashboard/pagos`, `/dashboard/facturas`, `/dashboard/finanzas/otros-ingresos` |
| **Proveedores** | Gastos, por pagar, por revisar, XML del SRI y **directorio de proveedores** (derivado de los gastos: RUC o nombre). | `/dashboard/finanzas/proveedores[/clave]`, `/dashboard/gastos` |
| **Trabajadores** | Costo del equipo (sueldos y honorarios registrados como gasto) y el plan del módulo de nómina ecuatoriana. | `/dashboard/finanzas/trabajadores` |
| **Caja y Bancos** | Cuentas, importación de extractos, conciliación y reglas. | `/dashboard/finanzas/banco` |
| **Empresa** | Datos de cada empresa (RUC, régimen, día de declaración, firma .p12, puntos de emisión, bancos), libro diario, asiento manual, mayor, plan de cuentas, activos fijos, dueños y accionistas, cierre de mes. | `/dashboard/finanzas/empresa`, `/dashboard/contabilidad?tab=…`, `/dashboard/finanzas/aportes` |
| **Reportes** | Catálogo agrupado: estados financieros (incluye **consolidados**), ventas, compras, sueldos, impuestos, caja y bancos. | `/dashboard/finanzas/reportes`, `/dashboard/contabilidad?tab=estados&entidad=CONSOLIDADO` |

Reglas que se mantienen: todo número lleva a su detalle; pantallas en vez de ventanas; los reportes
contables leen solo del libro diario (la portada usa cifras operativas, como el antiguo Resumen).

Implementación: `src/app/dashboard/(finanzas)/modules.ts` define módulos, colores, íconos y a qué
módulo pertenece cada URL; `finance-nav.tsx` dibuja las píldoras y las sub-pestañas. Las URLs viejas
`/dashboard/finanzas?tab=…` redirigen a las nuevas. Colores de gráficos validados para daltonismo
(`finanzas/chart-colors.ts`). Vencimientos SRI por noveno dígito del RUC: `src/lib/taxes/calendar.ts`.

## Lo que falta para venderla a otro gimnasio (fases siguientes — requieren cambio de esquema)

Hoy la empresa está "cosida" al código: `Sede` es un enum y `ENTITIES` (`src/lib/finance/entities.ts`)
tiene RUC, dueños y régimen escritos a mano; el plan de cuentas (`src/lib/accounting/chart.ts`) tiene
los bancos de La Cueva. Para que otro gimnasio la use:

1. **Empresas en la base de datos** (`Company`: razón social, RUC, tipo persona natural / sociedad,
   obligado a llevar contabilidad, agente de retención, régimen RIMPE/general, dirección matriz) y la
   relación sede → empresa en tabla, no en enum. La pantalla Empresa pasa de "solo ver" a editar.
2. **Plantillas de plan de cuentas** por tipo de empresa (persona natural no obligada, obligada,
   sociedad) en lugar de los catálogos por sede; los bancos se crean desde Caja y Bancos.
3. **Proveedores como tabla** (RUC, nombre, contacto, plazo de pago, retenciones habituales) en vez
   de derivarlos de los gastos; habilita pagos a proveedores y retenciones.
4. **Nómina** (Trabajadores): contratos, rol mensual, IESS, fondos de reserva, décimos, vacaciones,
   utilidades, retención en relación de dependencia y planilla; asiento automático. Bloqueado por los
   datos del personal (Isabel).
5. **Retenciones en la fuente** (emisión del comprobante electrónico) para empresas agentes de retención.
6. **Eliminaciones intercompañía** en los estados consolidados si las empresas del grupo se prestan
   o facturan entre sí (hoy no ocurre en La Cueva).
7. **Feriados nacionales** en el calendario del SRI.

Cada punto toca el esquema: se discute antes de construir (regla del repo).

## Pagos (Clientes › Cobros de socios) — 4 oct 2026

- Misma apariencia que Contabilidad (barra de módulos para dueños/contabilidad; recepción ve la página blanca sin la barra).
- Filtros en la URL: rango de fechas (presets o desde–hasta, día de Ecuador exacto: `paidBetween` en
  `src/lib/payments/filters.ts`), sede, estado, forma de pago, factura, banco y búsqueda por socio / quien pagó /
  referencia. Los totales de arriba son del conjunto filtrado completo.
- **Una factura de membresía por socio y mes**: `createInvoice` rechaza otra si el socio ya tiene una vigente ese
  mes, salvo que se facture desde otro cobro ya **confirmado** con el banco. El editor lo advierte antes.
- **Quien paga ≠ socio** (papá que paga por el hijo): el editor separa *Socio* de *Facturar a*; si el depositante
  del cobro no es el socio, arranca en "Otra persona paga". Su cédula nunca se guarda en la ficha del socio.
- **Eliminar o cambiar monto/fecha de un cobro** (`assertCanChange` en `src/lib/actions/payments.ts`): bloqueado si
  está conciliado con el banco (deshacer conciliación primero), si tiene factura vigente (anularla primero) o si su
  mes está cerrado. Un cobro confirmado solo lo toca contabilidad; recepción puede corregir su propio cobro el mismo día.
