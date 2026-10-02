// Drill-down URLs shared by the accounting reports.

/** Ledger (mayor) of one account for a date range. */
export const mayorHref = (sede: string, accountId: string, desde: string, hasta: string) =>
  `/dashboard/contabilidad?tab=mayor&entidad=${sede}&cuenta=${accountId}&desde=${desde}&hasta=${hasta}&mes=${hasta.slice(0, 7)}`;

/** The document behind a journal entry. */
export const originHref = (sede: string, e: { source: string; sourceId: string | null; date: Date; entryId: string }) =>
  `/dashboard/finanzas/origen?${new URLSearchParams({ source: e.source, id: e.sourceId ?? "", sede, fecha: e.date.toISOString().slice(0, 10), entry: e.entryId })}`;
