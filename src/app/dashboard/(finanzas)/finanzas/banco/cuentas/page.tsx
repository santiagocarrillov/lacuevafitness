import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { listBankAccounts } from "@/lib/actions/bank";
import { ENTITIES } from "@/lib/finance/entities";
import { ecuadorDateString } from "@/lib/timezone";
import { PageHeader } from "../../../page-header";
import { DeactivateAccountButton } from "../../banco-forms";

export const dynamic = "force-dynamic";

export default async function CuentasPage() {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const accounts = await listBankAccounts();
  const canEdit = can.editFinancials(user);
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <PageHeader title="Cuentas bancarias" subtitle="Una por cada cuenta de la que se suben extractos. Las personales mezcladas cobran del gimnasio pero lo personal no entra a la contabilidad.">
        {canEdit && (
          <Link href="/dashboard/finanzas/banco/nueva-cuenta" className="inline-flex h-9 items-center rounded-full bg-[#3a8fd1] px-4 text-sm font-medium text-white hover:opacity-90">
            + Agregar cuenta
          </Link>
        )}
      </PageHeader>
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-stone-50/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Cuenta</th>
              <th className="px-3 py-2.5 font-medium">Empresa</th>
              <th className="hidden px-3 py-2.5 font-medium md:table-cell">Tipo</th>
              <th className="px-3 py-2.5 font-medium">Extractos</th>
              <th className="px-4 py-2.5" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="px-4 py-2.5">
                  <Link href={`/dashboard/finanzas/banco/movimientos?cuenta=${a.id}`} className="font-medium hover:underline">
                    {a.name}
                    {a.last4 && <span className="text-muted-foreground"> ··{a.last4}</span>}
                  </Link>
                  <p className="text-xs text-muted-foreground">{a.bank}</p>
                </td>
                <td className="px-3 py-2.5 text-xs">{ENTITIES[a.sede].name}</td>
                <td className="hidden px-3 py-2.5 text-xs md:table-cell">{a.kind === "PERSONAL_MIXED" ? "Personal mezclada" : "Del negocio"}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {a.lastPostedAt ? `${ecuadorDateString(a.firstPostedAt!)} → ${ecuadorDateString(a.lastPostedAt)}` : "Sin extractos"}
                  {a.pendingCount > 0 && <span className="block text-amber-700">{a.pendingCount} por clasificar</span>}
                </td>
                <td className="px-4 py-2.5 text-right">{canEdit && !a.lastPostedAt && <DeactivateAccountButton id={a.id} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
