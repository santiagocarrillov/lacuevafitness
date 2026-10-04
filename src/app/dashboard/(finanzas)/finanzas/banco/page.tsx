import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { PageHeader } from "../../page-header";
import { BancoTab } from "../banco-tab";

export const dynamic = "force-dynamic";

export default async function CajaBancosPage({ searchParams }: { searchParams: Promise<{ cuenta?: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const { cuenta } = await searchParams;
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Caja y Bancos" subtitle="Cuentas, extractos del banco y conciliación: cada movimiento se clasifica una vez y se contabiliza solo." />
      <BancoTab accountId={cuenta || undefined} canEdit={can.editFinancials(user)} />
    </div>
  );
}
