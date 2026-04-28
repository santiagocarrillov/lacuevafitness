import Link from "next/link";
import { redirect } from "next/navigation";
import { Sede } from "@/generated/prisma/client";
import { requireAuth, getSedeScope, can } from "@/lib/auth";
import { GestionTab } from "./gestion-tab";
import { ComercialTab } from "./comercial-tab";
import { ContableTab } from "./contable-tab";
import { DateRangePicker } from "./date-range-picker";
import { DetailPanel } from "./detail-panel";

export const dynamic = "force-dynamic";

const tabs = [
  { key: "gestion", label: "Gestión" },
  { key: "comercial", label: "Comercial" },
  { key: "contable", label: "Contable" },
];

const sedes = [
  { key: "", label: "Ambas" },
  { key: "FITNESS_CENTER", label: "Fitness Center" },
  { key: "XTREME", label: "Xtreme" },
];

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    sede?: string;
    from?: string;
    to?: string;
    detail?: string;
    // backward compat
    year?: string;
    month?: string;
  }>;
}) {
  const user = await requireAuth();
  if (!can.viewReports(user)) redirect("/dashboard?forbidden=1");
  const scopedSede = getSedeScope(user);
  const canContable = can.viewFinancials(user);

  const params = await searchParams;
  let tab = params.tab ?? "gestion";
  if (tab === "contable" && !canContable) tab = "gestion";

  const sede = (scopedSede ?? params.sede ?? "") as "" | Sede;

  const now = new Date();

  // Compute from/to with backward compat for year/month params
  let from: string;
  let to: string;

  if (params.from && params.to) {
    from = params.from;
    to = params.to;
  } else if (params.year && params.month) {
    // Backward compat: derive from year+month
    const y = parseInt(params.year);
    const m = parseInt(params.month);
    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    from = isoDate(firstDay);
    to = isoDate(lastDay);
  } else {
    // Default: first day of current month to today
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    from = isoDate(firstDay);
    to = isoDate(now);
  }

  const detail = params.detail;

  // Derive year/month from "from" for GestionTab (needs monthly targets)
  const fromDate = new Date(from + "T00:00:00");
  const gestionYear = fromDate.getFullYear();
  const gestionMonth = fromDate.getMonth() + 1;

  function buildUrl(updates: Record<string, string>) {
    const base: Record<string, string> = { tab, sede, from, to };
    if (detail && !("detail" in updates)) {
      // keep existing detail unless overridden or explicitly cleared
    }
    const merged = { ...base, ...updates };
    const p = new URLSearchParams(merged);
    return `/dashboard/reportes?${p.toString()}`;
  }

  // Close URL removes detail param
  const closeHref = buildUrl({ detail: "" }).replace("detail=&", "").replace("&detail=", "").replace("detail=", "");

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Tablero de control — gestión, comercial y contable.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 justify-between border-b pb-3">
        <div className="flex gap-1">
          {tabs
            .filter((t) => t.key !== "contable" || canContable)
            .map((t) => (
              <Link
                key={t.key}
                href={buildUrl({ tab: t.key })}
                className={`px-4 py-2 text-sm rounded-md transition ${
                  tab === t.key
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-muted-foreground"
                }`}
              >
                {t.label}
              </Link>
            ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {!scopedSede && (
            <div className="flex gap-1">
              {sedes.map((s) => (
                <Link
                  key={s.key}
                  href={buildUrl({ sede: s.key })}
                  className={`px-2.5 py-1 text-xs rounded-md border transition ${
                    sede === s.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-accent"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          )}
          <DateRangePicker
            from={from}
            to={to}
            sede={sede}
            tab={tab}
            detail={detail}
          />
        </div>
      </div>

      {tab === "gestion" && (
        <GestionTab sede={sede || undefined} year={gestionYear} month={gestionMonth} />
      )}
      {tab === "comercial" && (
        <ComercialTab sede={sede || undefined} from={from} to={to} buildUrl={buildUrl} />
      )}
      {tab === "contable" && (
        <ContableTab sede={sede || undefined} from={from} to={to} buildUrl={buildUrl} />
      )}

      {detail && (
        <DetailPanel
          detail={detail}
          from={from}
          to={to}
          sede={sede || undefined}
          closeHref={closeHref}
        />
      )}
    </div>
  );
}
