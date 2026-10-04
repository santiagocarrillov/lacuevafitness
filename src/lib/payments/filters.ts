// Filters of the Pagos list (no server-only imports). Everything lives in the
// URL so a filtered view can be linked from Contabilidad.

import type { PaymentMethod, Prisma, Sede } from "@/generated/prisma/client";
import { ecuadorDateString } from "@/lib/timezone";

export const RANGE_PRESETS = [
  { value: "hoy", label: "Hoy" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "mes", label: "Este mes" },
  { value: "mes-pasado", label: "Mes pasado" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "90d", label: "Últimos 90 días" },
  { value: "anio", label: "Este año" },
] as const;

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia",
  STRIPE_CARD: "Tarjeta (Stripe)",
  STRIPE_LINK: "Link de pago",
  PLUX_CARD: "Tarjeta (Plux)",
  OTHER: "Otro",
};

export type PaymentFilters = {
  desde: string; // YYYY-MM-DD, Ecuador day, inclusive
  hasta: string;
  rango: string | null; // preset that produced desde/hasta, or null = custom
  sede: Sede | null;
  estado: "confirmado" | "pendiente" | "anulado" | null;
  metodos: PaymentMethod[];
  factura: "con" | "sin" | null;
  banco: "conciliado" | "sin" | null;
  q: string;
  page: number;
};

const isDay = (v: string | undefined | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** desde/hasta of a preset, relative to today in Ecuador. */
export function presetRange(preset: string, today = ecuadorDateString()): { desde: string; hasta: string } | null {
  const ym = today.slice(0, 7);
  switch (preset) {
    case "hoy":
      return { desde: today, hasta: today };
    case "7d":
      return { desde: addDays(today, -6), hasta: today };
    case "30d":
      return { desde: addDays(today, -29), hasta: today };
    case "90d":
      return { desde: addDays(today, -89), hasta: today };
    case "mes":
      return { desde: `${ym}-01`, hasta: today };
    case "mes-pasado": {
      const first = new Date(`${ym}-01T00:00:00Z`);
      first.setUTCMonth(first.getUTCMonth() - 1);
      const start = first.toISOString().slice(0, 10);
      return { desde: start, hasta: addDays(`${ym}-01`, -1) };
    }
    case "anio":
      return { desde: `${today.slice(0, 4)}-01-01`, hasta: today };
    default:
      return null;
  }
}

/** A month (YYYY-MM) as a range, for links from Contabilidad. */
export function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { desde: `${ym}-01`, hasta: last };
}

const METHODS = Object.keys(METHOD_LABELS) as PaymentMethod[];

export function parsePaymentFilters(sp: Record<string, string | undefined>, scopedSede: Sede | null): PaymentFilters {
  const today = ecuadorDateString();
  let desde: string, hasta: string, rango: string | null;
  if (isDay(sp.desde) && isDay(sp.hasta)) {
    [desde, hasta] = sp.desde <= sp.hasta ? [sp.desde, sp.hasta] : [sp.hasta, sp.desde];
    rango = null;
  } else if (sp.mes && /^\d{4}-\d{2}$/.test(sp.mes)) {
    ({ desde, hasta } = monthRange(sp.mes));
    rango = null;
  } else {
    rango = sp.rango && presetRange(sp.rango, today) ? sp.rango : "mes";
    ({ desde, hasta } = presetRange(rango, today)!);
  }
  // Keep the exact day filter cheap (see paidBetween): at most ~2 years.
  if (Date.parse(hasta) - Date.parse(desde) > 800 * 86_400_000) desde = addDays(hasta, -800);
  const sede = scopedSede ?? (sp.sede === "FITNESS_CENTER" || sp.sede === "XTREME" ? sp.sede : null);
  return {
    desde,
    hasta,
    rango,
    sede,
    estado: sp.estado === "confirmado" || sp.estado === "pendiente" || sp.estado === "anulado" ? sp.estado : null,
    metodos: (sp.metodo ?? "").split(",").filter((m): m is PaymentMethod => METHODS.includes(m as PaymentMethod)),
    factura: sp.factura === "con" || sp.factura === "sin" ? sp.factura : null,
    banco: sp.banco === "conciliado" || sp.banco === "sin" ? sp.banco : null,
    q: (sp.q ?? "").trim().slice(0, 80),
    page: Math.max(1, parseInt(sp.page ?? "1", 10) || 1),
  };
}

/**
 * Payments whose Ecuador day is within [desde, hasta]. paidAt is either a
 * date-only value (00:00 UTC = that day) or a real timestamp (Ecuador day =
 * UTC − 5 h), the same rule as postingDay(); payments without a date fall back
 * to when they were recorded.
 */
export function paidBetween(desde: string, hasta: string): Prisma.PaymentWhereInput {
  const midnights: Date[] = [];
  for (let d = desde; d <= hasta; d = addDays(d, 1)) midnights.push(new Date(`${d}T00:00:00Z`));
  const from = new Date(`${desde}T05:00:00Z`);
  const to = new Date(`${addDays(hasta, 1)}T05:00:00Z`);
  const nextMidnight = new Date(`${addDays(hasta, 1)}T00:00:00Z`);
  return {
    OR: [
      { paidAt: { in: midnights } },
      { paidAt: { gte: from, lt: to, not: nextMidnight } },
      { paidAt: null, createdAt: { gte: from, lt: to } },
    ],
  };
}

/** Prisma filter of the payments list (member payments only, not pool entries). */
export function paymentsWhere(f: PaymentFilters, matchIds?: string[] | null): Prisma.PaymentWhereInput {
  const and: Prisma.PaymentWhereInput[] = [{ isPoolEntry: false, memberId: { not: null } }, paidBetween(f.desde, f.hasta)];
  if (f.sede) and.push({ sede: f.sede });
  if (f.estado) and.push({ status: f.estado === "confirmado" ? "SUCCEEDED" : f.estado === "anulado" ? "VOIDED" : "PENDING" });
  else and.push({ status: { in: ["SUCCEEDED", "PENDING"] } });
  if (f.metodos.length) and.push({ method: { in: f.metodos } });
  if (f.factura === "con") and.push({ invoice: { status: { not: "VOIDED" } } });
  if (f.factura === "sin") and.push({ OR: [{ invoiceId: null }, { invoice: { status: "VOIDED" } }] });
  if (f.banco === "conciliado") and.push({ OR: [{ bankTransactionId: { not: null } }, { reconciledAt: { not: null } }] });
  if (f.banco === "sin") and.push({ bankTransactionId: null, reconciledAt: null });
  // Text search runs first, accent-insensitive (lib/text-search): its ids come in here.
  if (matchIds) and.push({ id: { in: matchIds } });
  return { AND: and };
}
