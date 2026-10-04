import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { MonthNav, PageHeader } from "../../page-header";
import { ImpuestosTab } from "../impuestos-tab";
import { monthParam } from "../month";

export const dynamic = "force-dynamic";

export default async function ImpuestosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const { ym, thisMonth } = monthParam((await searchParams).mes);
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Impuestos" subtitle="Borrador del formulario 104 (IVA) por empresa y el ATS de Xtreme, del mes elegido.">
        <MonthNav ym={ym} thisMonth={thisMonth} href={(m) => `/dashboard/finanzas/impuestos?mes=${m}`} />
      </PageHeader>
      <ImpuestosTab ym={ym} />
    </div>
  );
}
