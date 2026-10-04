import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { listBankAccounts } from "@/lib/actions/bank";
import { ENTITIES } from "@/lib/finance/entities";
import { ecuadorDateString } from "@/lib/timezone";
import { FormPage } from "@/app/dashboard/form-page";
import { ImportForm } from "../../banco-forms";

export const dynamic = "force-dynamic";

const HOW: Record<string, string> = {
  PACIFICO: "Banca en línea del Pacífico › Cuentas › Movimientos › Exportar a Excel.",
  PICHINCHA: "Banca Web Pichincha › Movimientos de cuenta › Descargar (Excel).",
  PRODUBANCO: "Produbanco en línea › Cuentas › Movimientos › Exportar a Excel.",
};

export default async function ImportarExtractoPage({ searchParams }: { searchParams: Promise<{ cuenta?: string }> }) {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  const { cuenta } = await searchParams;
  const accounts = await listBankAccounts();
  return (
    <FormPage title="Subir extracto del banco" description="El archivo .xlsx tal como lo descarga el banco. Subir el mismo período dos veces no duplica nada.">
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Primero <Link href="/dashboard/finanzas/banco/nueva-cuenta" className="font-medium text-primary hover:underline">agrega la cuenta</Link>.
        </p>
      ) : (
        <div className="space-y-6">
          <ImportForm accounts={accounts.map((a) => ({ id: a.id, name: `${a.name}${a.last4 ? ` ··${a.last4}` : ""}` }))} defaultAccountId={cuenta} />
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-600">Hasta dónde está cada cuenta</h2>
            <ul className="divide-y rounded-lg border text-sm">
              {accounts.map((a) => (
                <li key={a.id} className="px-3 py-2">
                  <p className="font-medium">
                    {a.name}
                    {a.last4 && <span className="text-muted-foreground"> ··{a.last4}</span>}
                    <span className="font-normal text-muted-foreground"> · {ENTITIES[a.sede].name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.lastPostedAt
                      ? `Tiene hasta el ${ecuadorDateString(a.lastPostedAt)}: descarga desde el ${ecuadorDateString(new Date(a.lastPostedAt.getTime() + 86_400_000))} hasta hoy.`
                      : "Sin extractos todavía: descarga desde el 1 de enero de este año para que cuadre con los libros."}
                  </p>
                  <p className="text-xs text-muted-foreground">{HOW[a.statementFormat]}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </FormPage>
  );
}
