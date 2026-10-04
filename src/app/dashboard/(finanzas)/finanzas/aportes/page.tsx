import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { MonthNav, PageHeader } from "../../page-header";
import { AportesTab } from "../aportes-tab";
import { monthParam } from "../month";

export const dynamic = "force-dynamic";

export default async function DuenosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const { ym, thisMonth } = monthParam((await searchParams).mes);
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Dueños y accionistas" subtitle="Aportes, préstamos de accionistas, devoluciones y retiros. El dinero de los dueños nunca es ingreso.">
        <MonthNav ym={ym} thisMonth={thisMonth} href={(m) => `/dashboard/finanzas/aportes?mes=${m}`} />
      </PageHeader>
      <AportesTab ym={ym} canEdit={can.editFinancials(user)} />
    </div>
  );
}
