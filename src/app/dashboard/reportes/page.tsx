import Link from "next/link";
import { redirect } from "next/navigation";
import { Sede } from "@/generated/prisma/client";
import { requireAuth, getSedeScope, can } from "@/lib/auth";
import { GestionTab } from "./gestion-tab";
import { ComercialTab } from "./comercial-tab";
import { ContableTab } from "./contable-tab";

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

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sede?: string; year?: string; month?: string }>;
}) {
  const user = await requireAuth();
  if (!can.viewReports(user)) redirect("/dashboard?forbidden=1");
  const scopedSede = getSedeScope(user);
  const canContable = can.viewFinancials(user);

  const params = await searchParams;
  let tab = params.tab ?? "gestion";
  if (tab === "contable" && !canContable) tab = "gestion";
  // Scoped users are locked to their sede
  const sede = (scopedSede ?? params.sede ?? "") as "" | Sede;
  const now = new Date();
  const year = parseInt(params.year ?? now.getFullYear().toString());
  const month = parseInt(params.month ?? (now.getMonth() + 1).toString());

  function buildUrl(updates: Record<string, string>) {
    const p = new URLSearchParams({
      tab, sede, year: year.toString(), month: month.toString(), ...updates,
    });
    return `/dashboard/reportes?${p.toString()}`;
  }

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
          <form action="/dashboard/reportes" className="flex gap-1 items-center">
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="sede" value={sede} />
            <select name="month" defaultValue={month}
              className="h-7 rounded-md border border-input bg-background px-2 text-xs">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1).toLocaleDateString("es-EC", { month: "long" })}
                </option>
              ))}
            </select>
            <select name="year" defaultValue={year}
              className="h-7 rounded-md border border-input bg-background px-2 text-xs">
              {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="submit"
              className="h-7 px-2 text-xs rounded-md bg-primary text-primary-foreground">
              Ver
            </button>
          </form>
        </div>
      </div>

      {tab === "gestion" && <GestionTab sede={sede || undefined} year={year} month={month} />}
      {tab === "comercial" && <ComercialTab sede={sede || undefined} year={year} month={month} />}
      {tab === "contable" && <ContableTab sede={sede || undefined} year={year} month={month} />}
    </div>
  );
}
