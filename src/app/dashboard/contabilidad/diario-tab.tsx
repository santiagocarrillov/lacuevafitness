import type { Sede } from "@/generated/prisma/enums";
import { getJournal } from "@/lib/actions/accounting";
import { SOURCE_LABELS, day, money } from "./shared";
import { VoidEntryButton } from "./entry-form";

export async function DiarioTab({ sede, from, to, canEdit }: { sede: Sede; from: string; to: string; canEdit: boolean }) {
  const entries = await getJournal(sede, from, to);
  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        No hay asientos en este mes.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {entries.map((e) => {
        const voided = e.status === "VOIDED";
        const total = e.lines.reduce((s, l) => s + l.debitCents, 0);
        return (
          <div key={e.id} className={`rounded-md border ${voided ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-3 py-2 text-sm">
              <span className="font-semibold tabular-nums">N.º {e.number}</span>
              <span className="tabular-nums text-muted-foreground">{day(e.date)}</span>
              <span className="rounded bg-background border px-1.5 text-[11px]">{SOURCE_LABELS[e.source] ?? e.source}</span>
              <span className={`flex-1 ${voided ? "line-through" : ""}`}>{e.description}</span>
              <span className="tabular-nums text-muted-foreground">{money(total)}</span>
              {voided ? (
                <span className="text-xs text-red-700">Anulado{e.voidReason ? `: ${e.voidReason}` : ""}</span>
              ) : (
                canEdit && e.source === "MANUAL" && <VoidEntryButton id={e.id} />
              )}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {e.lines
                  .sort((a, b) => b.debitCents - a.debitCents)
                  .map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className={`px-3 py-1 ${l.creditCents > 0 ? "pl-10" : ""}`}>
                        <span className="text-xs text-muted-foreground tabular-nums mr-2">{l.account.code}</span>
                        {l.account.name}
                        {(l.party || l.memo) && (
                          <span className="text-xs text-muted-foreground"> · {[l.party, l.memo].filter(Boolean).join(" · ")}</span>
                        )}
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums w-32">{l.debitCents ? money(l.debitCents) : ""}</td>
                      <td className="px-3 py-1 text-right tabular-nums w-32">{l.creditCents ? money(l.creditCents) : ""}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
