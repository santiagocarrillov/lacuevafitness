import Link from "next/link";
import type { Sede } from "@/generated/prisma/enums";
import { getGeneralLedger } from "@/lib/actions/accounting";
import { SOURCE_LABELS, day, money } from "./shared";

type Account = { id: string; code: string; name: string };

export async function MayorTab({
  sede, from, to, accountId, accounts, hrefBase,
}: { sede: Sede; from: string; to: string; accountId?: string; accounts: Account[]; hrefBase: string }) {
  const selected = accounts.find((a) => a.id === accountId) ?? null;
  const gl = selected ? await getGeneralLedger(sede, selected.id, from, to) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {accounts.map((a) => (
          <Link
            key={a.id}
            href={`${hrefBase}&cuenta=${a.id}`}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${a.id === selected?.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
          >
            {a.code} {a.name}
          </Link>
        ))}
      </div>

      {!gl ? (
        <p className="text-sm text-muted-foreground">Elige una cuenta para ver su mayor del mes.</p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left font-medium px-3 py-2">Fecha</th>
                <th className="text-left font-medium px-3 py-2">N.º</th>
                <th className="text-left font-medium px-3 py-2">Detalle</th>
                <th className="text-right font-medium px-3 py-2">Debe</th>
                <th className="text-right font-medium px-3 py-2">Haber</th>
                <th className="text-right font-medium px-3 py-2">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b text-muted-foreground">
                <td className="px-3 py-1.5" colSpan={5}>Saldo al inicio del período</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(gl.openingCents)}</td>
              </tr>
              {gl.lines.map((l) => (
                <tr key={`${l.entryId}-${l.debitCents}-${l.creditCents}-${l.party}`} className="border-b last:border-0">
                  <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">{day(l.date)}</td>
                  <td className="px-3 py-1.5 tabular-nums">{l.number}</td>
                  <td className="px-3 py-1.5">
                    {l.description}
                    <span className="text-xs text-muted-foreground">
                      {" "}· {SOURCE_LABELS[l.source] ?? l.source}{l.party ? ` · ${l.party}` : ""}{l.memo ? ` · ${l.memo}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.debitCents ? money(l.debitCents) : ""}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.creditCents ? money(l.creditCents) : ""}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{money(l.balanceCents)}</td>
                </tr>
              ))}
              {gl.lines.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-3 text-center text-muted-foreground">Sin movimientos en el período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
