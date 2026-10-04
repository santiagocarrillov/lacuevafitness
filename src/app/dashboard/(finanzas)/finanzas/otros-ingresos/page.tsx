import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { MonthNav, PageHeader } from "../../page-header";
import { OtrosIngresosTab } from "../otros-ingresos-tab";
import { monthParam } from "../month";

export const dynamic = "force-dynamic";

export default async function OtrosIngresosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const { ym, thisMonth } = monthParam((await searchParams).mes);
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Otros ingresos" subtitle="Ventas que no son membresías: bebidas, suplementos, reembolsos.">
        <MonthNav ym={ym} thisMonth={thisMonth} href={(m) => `/dashboard/finanzas/otros-ingresos?mes=${m}`} />
      </PageHeader>
      <OtrosIngresosTab ym={ym} canEdit={can.editFinancials(user)} />
    </div>
  );
}
