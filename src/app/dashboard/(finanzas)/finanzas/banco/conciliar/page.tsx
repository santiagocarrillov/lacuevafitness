import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getInbox, listBankAccounts, loanAccounts } from "@/lib/actions/bank";
import { ENTITY_ORDER } from "@/lib/finance/entities";
import { PageHeader } from "../../../page-header";
import { ApplySafeButton, InboxRow } from "../../banco-forms";

export const dynamic = "force-dynamic";

export default async function ConciliarPage({ searchParams }: { searchParams: Promise<{ cuenta?: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const { cuenta } = await searchParams;
  const canEdit = can.editFinancials(user);
  const [accounts, inbox, loans] = await Promise.all([listBankAccounts(), getInbox(cuenta || undefined), loanAccounts(ENTITY_ORDER)]);
  const safe = inbox.filter((l) => l.suggestion?.confident).length;
  const link = (id?: string) => `/dashboard/finanzas/banco/conciliar${id ? `?cuenta=${id}` : ""}`;
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition ${active ? "border-[#3a8fd1] bg-[#3a8fd1]/10 text-[#1f5f91]" : "bg-white text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <PageHeader title="Conciliar" subtitle="Cada movimiento del extracto se clasifica una vez: crea o confirma el cobro, el gasto o el pago, y se contabiliza contra el banco.">
        {canEdit && <ApplySafeButton accountId={cuenta || undefined} count={safe} />}
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <Link href={link()} className={pill(!cuenta)}>
          Todas · {accounts.reduce((s, a) => s + a.pendingCount, 0)}
        </Link>
        {accounts.map((a) => (
          <Link key={a.id} href={link(a.id)} className={pill(cuenta === a.id)}>
            {a.name}
            {a.last4 && ` ··${a.last4}`} · {a.pendingCount}
          </Link>
        ))}
      </div>

      {inbox.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">
          Nada pendiente.{" "}
          {canEdit && (
            <Link href="/dashboard/finanzas/banco/importar" className="font-medium text-[#2f6fb0] hover:underline">
              Sube el extracto más reciente
            </Link>
          )}{" "}
          para seguir conciliando.
        </div>
      ) : (
        <ul className="rounded-xl border border-stone-200 bg-white px-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          {inbox.map((l) => (
            <InboxRow key={l.id} line={l} loanAccounts={loans.filter((x) => x.sede === l.sede)} canEdit={canEdit} />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Verde: sugerencia segura (reglas, comisiones, transferencias entre tus cuentas, pagos que calzan en monto y nombre). Ámbar: revísala antes de aceptar.
        {inbox.length >= 300 && " Se muestran los 300 más antiguos."}
      </p>
    </div>
  );
}
