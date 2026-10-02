import type { getAccounts } from "@/lib/actions/accounting";
import { Indent, money } from "./shared";

const TYPE_LABELS: Record<string, string> = {
  ASSET: "Activo", LIABILITY: "Pasivo", EQUITY: "Patrimonio", INCOME: "Ingreso", EXPENSE: "Gasto",
};

export function PlanTab({ accounts }: { accounts: Awaited<ReturnType<typeof getAccounts>> }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left font-medium px-3 py-2">Cuenta</th>
              <th className="text-left font-medium px-3 py-2">Tipo</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">Saldo inicial</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const opening = a.openingBalances
                .filter((o) => o.asOf.getTime() === a.openingBalances[0]?.asOf.getTime())
                .reduce((s, o) => s + o.amountCents, 0);
              return (
                <tr key={a.id} className={`border-b last:border-0 ${!a.postable ? "bg-muted/20" : ""} ${!a.active ? "opacity-50" : ""}`}>
                  <td className="px-3 py-1.5">
                    <Indent depth={a.code.split(".").length - 1} bold={!a.postable}>
                      <span className="text-xs text-muted-foreground tabular-nums mr-2">{a.code}</span>
                      {a.name}
                    </Indent>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{TYPE_LABELS[a.type]}{!a.postable && " · grupo"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{a.openingBalances.length ? money(opening) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Saldos iniciales: EEFF 2025 firmados (asiento de apertura N.º 1). Para corregirlos, registra un asiento de ajuste.
      </p>
    </div>
  );
}
