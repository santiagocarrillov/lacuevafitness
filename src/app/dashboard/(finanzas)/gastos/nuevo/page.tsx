import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { ecuadorDateString } from "@/lib/timezone";
import { ExpenseEditor } from "../expense-editor";
import { expenseScope } from "../shared";

export const dynamic = "force-dynamic";

export default async function NuevoGastoPage() {
  const user = await requireAuth();
  const scope = await expenseScope(user);
  if (!scope) redirect("/dashboard?forbidden=1");
  return (
    <div className="p-4 md:p-8 space-y-4 max-w-6xl">
      <div>
        <Link href="/dashboard/gastos" className="text-sm text-muted-foreground hover:underline">← Gastos</Link>
        <h1 className="text-2xl font-semibold">Registrar gasto</h1>
      </div>
      <ExpenseEditor sedes={scope.sedes} accounts={scope.accounts} initial={null} today={ecuadorDateString()} isAdmin={!scope.full} />
    </div>
  );
}
