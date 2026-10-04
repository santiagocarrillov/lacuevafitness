import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { listRules } from "@/lib/actions/bank";
import { parseRuleLabel } from "@/lib/finance/bank-suggest";
import { TXN_KIND_LABELS } from "@/lib/finance/bank-filters";
import { ENTITIES, EXPENSE_CATEGORY_LABELS } from "@/lib/finance/entities";
import { PageHeader } from "../../../page-header";
import { RuleOffButton } from "../../banco-forms";

export const dynamic = "force-dynamic";

export default async function ReglasPage() {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const rules = await listRules();
  const canEdit = can.editFinancials(user);
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <PageHeader
        title="Reglas"
        subtitle="Al clasificar un movimiento puedes marcar «Recordar»: los siguientes que contengan ese texto se clasifican solos al subir el extracto."
      />
      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">
          Todavía no hay reglas. Se crean desde Conciliar, con la casilla «Recordar para movimientos que contengan…».
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-stone-50/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Si el movimiento contiene</th>
                <th className="px-3 py-2.5 font-medium">Se clasifica como</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Empresa</th>
                <th className="px-4 py-2.5" aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const l = parseRuleLabel(r.label);
                const what =
                  r.kind === "EXPENSE" && r.category ? `Gasto · ${EXPENSE_CATEGORY_LABELS[r.category]}` : r.kind === "CAPITAL" ? `Dueños · ${l.person}` : TXN_KIND_LABELS[r.kind];
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      «{r.pattern}»
                      <span className="block text-xs text-muted-foreground">{r.direction > 0 ? "Solo entradas" : r.direction < 0 ? "Solo salidas" : "Entradas y salidas"}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {what}
                      {l.description && <span className="block text-xs text-muted-foreground">{l.description}</span>}
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">{r.sede ? ENTITIES[r.sede].name : "Todas"}</td>
                    <td className="px-4 py-2.5 text-right">{canEdit && <RuleOffButton id={r.id} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
