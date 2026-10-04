// Date ranges of the filtered lists (Pagos, Gastos): presets relative to today
// in Ecuador, or any desde–hasta. Client-safe.

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

export const isDay = (v: string | undefined | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const addDays = (ymd: string, n: number) => {
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


/** desde/hasta/rango from the URL: explicit days, a month (?mes=), a preset, or `fallback`. */
export function parseRange(sp: Record<string, string | undefined>, fallback = "mes") {
  const today = ecuadorDateString();
  let desde: string, hasta: string, rango: string | null;
  if (isDay(sp.desde) && isDay(sp.hasta)) {
    [desde, hasta] = sp.desde <= sp.hasta ? [sp.desde, sp.hasta] : [sp.hasta, sp.desde];
    rango = null;
  } else if (sp.mes && /^\d{4}-\d{2}$/.test(sp.mes)) {
    ({ desde, hasta } = monthRange(sp.mes));
    rango = null;
  } else {
    rango = sp.rango && presetRange(sp.rango, today) ? sp.rango : fallback;
    ({ desde, hasta } = presetRange(rango, today)!);
  }
  return { desde, hasta, rango };
}
