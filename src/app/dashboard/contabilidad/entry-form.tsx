"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createManualEntry, voidManualEntry, type ManualLine } from "@/lib/actions/accounting";
import { fmtMoney } from "@/lib/finance/entities";

type Account = { id: string; code: string; name: string };
const blank = (): ManualLine => ({ accountId: "", debit: "", credit: "", memo: "", party: "" });
const toCents = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

export function EntryForm({ sede, defaultDate, accounts }: { sede: string; defaultDate: string; accounts: Account[] }) {
  const [date, setDate] = useState(defaultDate);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<ManualLine[]>([blank(), blank()]);
  const [pending, start] = useTransition();

  const debit = useMemo(() => lines.reduce((s, l) => s + toCents(l.debit), 0), [lines]);
  const credit = useMemo(() => lines.reduce((s, l) => s + toCents(l.credit), 0), [lines]);
  const diff = debit - credit;

  const set = (i: number, patch: Partial<ManualLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const r = await createManualEntry({ sede, date, description, lines });
        toast.success(`Asiento N.º ${r.number} registrado.`);
        setDescription("");
        setLines([blank(), blank()]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo registrar.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-5xl">
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1">
          <Label className="text-xs">Fecha</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Descripción</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Préstamo de Santiago para nómina de octubre" required />
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left font-medium px-2 py-2 min-w-64">Cuenta</th>
              <th className="text-left font-medium px-2 py-2">Tercero</th>
              <th className="text-left font-medium px-2 py-2">Glosa</th>
              <th className="text-right font-medium px-2 py-2 w-32">Debe</th>
              <th className="text-right font-medium px-2 py-2 w-32">Haber</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="px-2 py-1.5">
                  <select
                    value={l.accountId}
                    onChange={(e) => set(i, { accountId: e.target.value })}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                    required
                  >
                    <option value="">Elige la cuenta…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5"><Input value={l.party} onChange={(e) => set(i, { party: e.target.value })} placeholder="Persona / proveedor" /></td>
                <td className="px-2 py-1.5"><Input value={l.memo} onChange={(e) => set(i, { memo: e.target.value })} /></td>
                <td className="px-2 py-1.5">
                  <Input value={l.debit} inputMode="decimal" className="text-right" onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
                </td>
                <td className="px-2 py-1.5">
                  <Input value={l.credit} inputMode="decimal" className="text-right" onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
                </td>
                <td className="px-1">
                  {lines.length > 2 && (
                    <button type="button" aria-label="Quitar línea" className="text-muted-foreground hover:text-red-700" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="px-2 py-2" colSpan={3}>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setLines((ls) => [...ls, blank()])}>
                  + Agregar línea
                </button>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(debit, { decimals: true })}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(credit, { decimals: true })}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className={`text-sm ${diff === 0 && debit > 0 ? "text-emerald-700" : "text-amber-700"}`}>
          {debit === 0 ? "Ingresa los valores." : diff === 0 ? "Cuadra." : `Diferencia: ${fmtMoney(Math.abs(diff), { decimals: true })} ${diff > 0 ? "más en el debe" : "más en el haber"}.`}
        </p>
        <Button type="submit" disabled={pending || diff !== 0 || debit === 0}>{pending ? "Registrando…" : "Registrar asiento"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Para corregir un saldo inicial, registra un asiento de ajuste con fecha 31-dic-2025. Para préstamos de accionistas,
        pon a la persona como tercero: así sale su saldo individual.
      </p>
    </form>
  );
}

export function VoidEntryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-red-700 hover:underline"
      onClick={() => {
        const reason = window.prompt("Motivo de la anulación:");
        if (!reason) return;
        start(async () => {
          try {
            await voidManualEntry(id, reason);
            toast.success("Asiento anulado.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "No se pudo anular.");
          }
        });
      }}
    >
      Anular
    </button>
  );
}
