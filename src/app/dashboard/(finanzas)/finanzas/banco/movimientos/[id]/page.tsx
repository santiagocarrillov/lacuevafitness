import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getTransaction, loanAccounts } from "@/lib/actions/bank";
import { decisionLabel, type Decision } from "@/lib/finance/bank-suggest";
import { TXN_KIND_LABELS } from "@/lib/finance/bank-filters";
import { CAPITAL_KIND_LABELS, ENTITIES, EXPENSE_CATEGORY_LABELS, fmtMoney } from "@/lib/finance/entities";
import { ecuadorDateString } from "@/lib/timezone";
import { Panel } from "../../../../blocks";
import { InboxRow, UndoButton } from "../../../banco-forms";

export const dynamic = "force-dynamic";

const money = (c: number) => fmtMoney(c, { decimals: true });
const when = (d: Date) => d.toLocaleString("es-EC", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Guayaquil" });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default async function MovimientoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const data = await getTransaction(id);
  if (!data) notFound();
  const { line: t, inbox, entries, classifiedByName } = data;
  const canEdit = can.editFinancials(user);
  const loans = inbox ? await loanAccounts([t.account.sede]) : [];
  const d = (t.appliedJson as { decision?: Decision } | null)?.decision;
  const credit = t.amountCents > 0;

  const created: { label: string; detail: string; href: string; voided?: boolean }[] = [
    ...t.payments.map((p) => ({
      label: p.isPoolEntry ? "Depósito sin asignar (Pagos)" : `Cobro de ${p.member ? `${p.member.firstName} ${p.member.lastName}` : "socio"}`,
      detail: money(p.amountCents),
      href: `/dashboard/pagos/${p.id}`,
      voided: p.status === "FAILED" || p.status === "VOIDED",
    })),
    ...t.expenses.map((e) => ({
      label: `Gasto · ${EXPENSE_CATEGORY_LABELS[e.category]}`,
      detail: `${e.supplierName ?? e.description} · ${money(e.amountCents)}`,
      href: `/dashboard/gastos/${e.id}`,
      voided: !!e.voidedAt,
    })),
    ...t.capitalMovements.map((c) => ({
      label: `Dueños · ${CAPITAL_KIND_LABELS[c.kind]}`,
      detail: `${c.person} · ${money(c.amountCents)}`,
      href: "/dashboard/finanzas/aportes",
      voided: !!c.voidedAt,
    })),
    ...t.otherIncomes.map((o) => ({ label: "Otro ingreso", detail: `${o.description} · ${money(o.amountCents)}`, href: "/dashboard/finanzas/otros-ingresos", voided: !!o.voidedAt })),
    ...t.payrollLines.map((l) => ({
      label: `Sueldo de ${l.employee.firstName} ${l.employee.lastName}`,
      detail: `Rol ${l.run.period} · ${money(l.netCents)}`,
      href: `/dashboard/finanzas/trabajadores/roles/${l.run.id}`,
    })),
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-muted-foreground">
            <Link href={`/dashboard/finanzas/banco/movimientos?cuenta=${t.accountId}`} className="hover:underline">
              {t.account.name}
              {t.account.last4 && ` ··${t.account.last4}`}
            </Link>{" "}
            · {ENTITIES[t.account.sede].name} · {ecuadorDateString(t.postedAt)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{t.counterparty ?? t.description}</h1>
        </div>
        <p className={`text-3xl font-semibold tabular-nums ${credit ? "text-emerald-700" : "text-red-700"}`}>{money(t.amountCents)}</p>
      </header>

      {inbox ? (
        <Panel title="Clasificar">
          <ul>
            <InboxRow line={inbox} loanAccounts={loans} canEdit={canEdit} defaultOpen />
          </ul>
        </Panel>
      ) : (
        <Panel title="Clasificación" aside={canEdit && <UndoButton id={t.id} />}>
          <p className="text-sm font-medium">{t.status === "IGNORED" ? "Ignorado" : d ? decisionLabel(d) : t.kind ? TXN_KIND_LABELS[t.kind] : "Clasificado"}</p>
          <p className="text-xs text-muted-foreground">
            {t.classifiedAt ? `${when(t.classifiedAt)}${classifiedByName ? ` · ${classifiedByName}` : " · automático (regla)"}` : ""}
          </p>
          {d?.type === "LIABILITY_PAYMENT" && (
            <ul className="mt-3 divide-y rounded-lg border text-sm">
              {d.parts.map((p) => (
                <li key={p.code} className="flex justify-between px-3 py-1.5">
                  <span>{p.label ?? p.code} <span className="text-xs text-muted-foreground">{p.code}</span></span>
                  <span className="tabular-nums">{money(p.cents)}</span>
                </li>
              ))}
              {d.extraCents > 0 && (
                <li className="flex justify-between px-3 py-1.5">
                  <span>Intereses y multas (gasto)</span>
                  <span className="tabular-nums">{money(d.extraCents)}</span>
                </li>
              )}
            </ul>
          )}
          {d?.type === "LOAN_PAYMENT" && (
            <p className="mt-2 text-sm">Capital {money(Math.abs(t.amountCents) - d.interestCents)}{d.principalCode ? ` (cuenta ${d.principalCode})` : ""} · intereses {money(d.interestCents)}</p>
          )}
          {created.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-600">Lo que creó o confirmó</h3>
              <ul className="divide-y rounded-lg border text-sm">
                {created.map((c, i) => (
                  <li key={i}>
                    <Link href={c.href} className={`flex justify-between gap-3 px-3 py-2 hover:bg-stone-50 ${c.voided ? "text-muted-foreground line-through" : ""}`}>
                      <span>{c.label}</span>
                      <span className="text-muted-foreground">{c.detail}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}

      {entries.length > 0 && (
        <Panel title="Asiento contable">
          {entries.map((e) => (
            <div key={e.id} className="mb-3 last:mb-0">
              <p className="mb-1 text-xs text-muted-foreground">
                <Link href={`/dashboard/contabilidad?tab=diario&entidad=${e.sede}&mes=${e.date.toISOString().slice(0, 7)}#asiento-${e.id}`} className="hover:underline">
                  Asiento {e.number}
                </Link>{" "}
                · {e.date.toISOString().slice(0, 10)} · {e.description}
              </p>
              <table className="w-full text-sm">
                <tbody>
                  {e.lines.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-1.5 pr-3">
                        <span className="text-xs text-muted-foreground">{l.account.code}</span> {l.account.name}
                        {l.party && <span className="text-xs text-muted-foreground"> · {l.party}</span>}
                      </td>
                      <td className="w-28 py-1.5 text-right tabular-nums">{l.debitCents ? money(l.debitCents) : ""}</td>
                      <td className="w-28 py-1.5 text-right tabular-nums">{l.creditCents ? money(l.creditCents) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Panel>
      )}

      <Panel title="Del extracto">
        <dl className="divide-y">
          <Field label="Descripción">{t.description}</Field>
          {t.counterparty && <Field label="Contraparte">{t.counterparty}</Field>}
          {t.reference && <Field label="Referencia">{t.reference}</Field>}
          {t.balanceCents !== null && <Field label="Saldo después">{money(t.balanceCents)}</Field>}
          <Field label="Importado">{when(t.createdAt)}</Field>
          {t.notes && <Field label="Notas">{t.notes}</Field>}
        </dl>
      </Panel>
    </div>
  );
}
