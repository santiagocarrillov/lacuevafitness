import Link from "next/link";
import { getInbox, listBankAccounts, listClassified, listRules } from "@/lib/actions/bank";
import { decisionLabel, parseRuleLabel, type Decision } from "@/lib/finance/bank-suggest";
import { ENTITIES, EXPENSE_CATEGORY_LABELS, fmtMoney } from "@/lib/finance/entities";
import {
  ApplySafeButton,
  ImportForm,
  InboxRow,
  RuleOffButton,
  UndoButton,
} from "./banco-forms";

function shortDate(d: Date | null) {
  return d
    ? d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "2-digit", timeZone: "America/Guayaquil" })
    : "—";
}

export async function BancoTab({ accountId, canEdit }: { accountId?: string; canEdit: boolean }) {
  const [accounts, inbox, history, rules] = await Promise.all([
    listBankAccounts(),
    getInbox(accountId),
    listClassified(accountId),
    listRules(),
  ]);
  const safe = inbox.filter((l) => l.suggestion?.confident).length;
  const link = (id?: string) => `/dashboard/finanzas?tab=banco${id ? `&cuenta=${id}` : ""}`;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold">Cuentas</h2>
          {canEdit && <Link href="/dashboard/finanzas/banco/nueva-cuenta" className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted">+ Cuenta</Link>}
        </div>
        {accounts.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Agrega primero las cuentas: Pacífico de Xtreme y las de Pichincha/Produbanco de la Fitness.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href={link()}
              className={`rounded-md border p-3 text-sm hover:bg-muted ${!accountId ? "border-primary" : ""}`}
            >
              <p className="font-medium">Todas las cuentas</p>
              <p className="text-xs text-muted-foreground">
                {accounts.reduce((s, a) => s + a.pendingCount, 0)} por clasificar
              </p>
            </Link>
            {accounts.map((a) => (
              <Link
                key={a.id}
                href={link(a.id)}
                className={`rounded-md border p-3 text-sm hover:bg-muted ${accountId === a.id ? "border-primary" : ""}`}
              >
                <p className="font-medium">
                  {a.name}
                  {a.last4 && <span className="text-muted-foreground"> ··{a.last4}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ENTITIES[a.sede].name}
                  {a.kind === "PERSONAL_MIXED" && " · personal"} ·{" "}
                  {a.lastPostedAt ? `${shortDate(a.firstPostedAt)} → ${shortDate(a.lastPostedAt)}` : "sin movimientos"}
                </p>
                {a.pendingCount > 0 && <p className="text-xs text-amber-700">{a.pendingCount} por clasificar</p>}
              </Link>
            ))}
          </div>
        )}
        {canEdit && accounts.length > 0 && (
          <ImportForm accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            Bandeja · {inbox.length} movimiento{inbox.length === 1 ? "" : "s"} por clasificar
          </h2>
          {canEdit && <ApplySafeButton accountId={accountId} count={safe} />}
        </div>
        {inbox.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nada pendiente. Sube el estado de cuenta más reciente para seguir conciliando.
          </div>
        ) : (
          <ul className="rounded-md border px-3">
            {inbox.map((l) => (
              <InboxRow key={l.id} line={l} />
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Verde: sugerencia segura (reglas, comisiones, pagos que calzan en monto y nombre). Ámbar: revísala antes de aceptar.
        </p>
      </section>

      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Clasificados recientemente</h2>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {history.map((h) => {
                  const d = (h.appliedJson as { decision?: Decision } | null)?.decision;
                  return (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{shortDate(h.postedAt)}</td>
                      <td className="px-3 py-2">
                        {h.counterparty ?? h.description}
                        <span className="block text-xs text-muted-foreground">{h.account.name}</span>
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${h.amountCents > 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {fmtMoney(h.amountCents, { decimals: true })}
                      </td>
                      <td className="px-3 py-2 text-xs">{d ? decisionLabel(d) : h.status === "IGNORED" ? "Ignorado" : h.kind}</td>
                      <td className="px-3 py-2 text-right">{canEdit && <UndoButton id={h.id} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {rules.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Reglas aprendidas</h2>
          <ul className="rounded-md border divide-y text-sm">
            {rules.map((r) => {
              const l = parseRuleLabel(r.label);
              return (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1">
                    «{r.pattern}» {r.direction > 0 ? "(créditos)" : r.direction < 0 ? "(débitos)" : ""} →{" "}
                    {r.kind === "EXPENSE" && r.category ? EXPENSE_CATEGORY_LABELS[r.category] : r.kind === "CAPITAL" ? `Dueños · ${l.person}` : r.kind}
                    {l.description && <span className="text-muted-foreground"> · {l.description}</span>}
                  </span>
                  {canEdit && <RuleOffButton id={r.id} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
