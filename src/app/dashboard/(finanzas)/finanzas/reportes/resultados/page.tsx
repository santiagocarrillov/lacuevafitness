import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { MonthNav, PageHeader } from "../../../page-header";
import { ResumenTab } from "../../resumen-tab";
import { monthParam } from "../../month";

export const dynamic = "force-dynamic";

export default async function ResultadosPorSedePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const { ym, thisMonth } = monthParam((await searchParams).mes);
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Resultados por sede" subtitle="Ingresos, gastos y dinero de los dueños del mes, por empresa y consolidado.">
        <MonthNav ym={ym} thisMonth={thisMonth} href={(m) => `/dashboard/finanzas/reportes/resultados?mes=${m}`} />
      </PageHeader>
      <ResumenTab ym={ym} />
    </div>
  );
}
