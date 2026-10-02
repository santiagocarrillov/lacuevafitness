import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { ecuadorDateString } from "@/lib/timezone";
import { monthLabel, shiftMonth } from "@/lib/finance/entities";
import { ResumenTab } from "./resumen-tab";
import { AportesTab } from "./aportes-tab";
import { OtrosIngresosTab } from "./otros-ingresos-tab";
import { BancoTab } from "./banco-tab";
import { ImpuestosTab } from "./impuestos-tab";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "resumen", label: "Resumen del mes" },
  { key: "banco", label: "Banco" },
  { key: "aportes", label: "Aportes y préstamos" },
  { key: "otros", label: "Otros ingresos" },
  { key: "impuestos", label: "Impuestos" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; mes?: string; cuenta?: string }>;
}) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");

  const params = await searchParams;
  // Expenses moved to their own section (Gastos) inside the Finanzas menu.
  if (params.tab === "gastos") redirect(`/dashboard/gastos${params.mes ? `?mes=${params.mes}` : ""}`);
  const tab: Tab = TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "resumen";
  const thisMonth = ecuadorDateString().slice(0, 7);
  const ym = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? params.mes! : thisMonth;

  const href = (updates: { tab?: string; mes?: string }) =>
    `/dashboard/finanzas?${new URLSearchParams({ tab, mes: ym, ...updates }).toString()}`;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{TABS.find((t) => t.key === tab)?.label ?? "Finanzas"}</h1>
          <p className="text-sm text-muted-foreground">
            Contabilidad por entidad: La Cueva Fitness (persona natural) y La Cueva Xtreme S.A.S.
          </p>
        </div>
        <nav className="flex items-center gap-1 text-sm" aria-label="Mes">
          <Link href={href({ mes: shiftMonth(ym, -1) })} className="rounded-md border px-2.5 py-1.5 hover:bg-muted">
            ←
          </Link>
          <span className="min-w-36 text-center font-medium capitalize">{monthLabel(ym)}</span>
          <Link
            href={href({ mes: shiftMonth(ym, 1) })}
            aria-disabled={ym >= thisMonth}
            className={`rounded-md border px-2.5 py-1.5 hover:bg-muted ${ym >= thisMonth ? "pointer-events-none opacity-40" : ""}`}
          >
            →
          </Link>
          {ym !== thisMonth && (
            <Link href={href({ mes: thisMonth })} className="ml-1 text-xs text-primary hover:underline">
              Hoy
            </Link>
          )}
        </nav>
      </header>

      {tab === "resumen" && <ResumenTab ym={ym} />}
      {tab === "banco" && <BancoTab accountId={params.cuenta || undefined} canEdit={can.editFinancials(user)} />}
      {tab === "aportes" && <AportesTab ym={ym} canEdit={can.editFinancials(user)} />}
      {tab === "otros" && <OtrosIngresosTab ym={ym} canEdit={can.editFinancials(user)} />}
      {tab === "impuestos" && <ImpuestosTab ym={ym} />}
    </div>
  );
}
