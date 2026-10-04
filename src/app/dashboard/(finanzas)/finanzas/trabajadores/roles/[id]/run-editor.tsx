"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { computeLine, type EmployeeTerms } from "@/lib/payroll/compute";
import { savePayrollDraft, type LineEdit } from "@/lib/actions/payroll";

export type EditorLine = {
  id: string;
  name: string;
  position: string | null;
  terms: EmployeeTerms;
  daysWorked: number;
  overtime50Hours: number;
  overtime100Hours: number;
  bonusCents: number;
  otherDeductionsCents: number;
  incomeTaxCents: number;
  /** True when the stored withholding differs from the suggestion (typed by hand). */
  taxOverridden: boolean;
};

type Row = { days: string; h50: string; h100: string; bonus: string; deductions: string; tax: string };

const money = (c: number) => (c / 100).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toCents = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" ? 0 : Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const int = (v: string) => (v.trim() === "" ? 0 : Number(v));
const inputCls = "h-8 w-full rounded-md border border-input bg-white px-2 text-right text-sm tabular-nums";

/** Editable rol: days, overtime, bonuses and deductions; the rest recalculates as you type. */
export function RunEditor({ runId, period, lines, editable }: { runId: string; period: string; lines: EditorLine[]; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.id,
        {
          days: String(l.daysWorked),
          h50: l.overtime50Hours ? String(l.overtime50Hours) : "",
          h100: l.overtime100Hours ? String(l.overtime100Hours) : "",
          bonus: l.bonusCents ? (l.bonusCents / 100).toFixed(2) : "",
          deductions: l.otherDeductionsCents ? (l.otherDeductionsCents / 100).toFixed(2) : "",
          tax: l.taxOverridden ? (l.incomeTaxCents / 100).toFixed(2) : "",
        },
      ]),
    ),
  );
  const [dirty, setDirty] = useState(false);
  const set = (id: string, k: keyof Row, v: string) => {
    setRows((r) => ({ ...r, [id]: { ...r[id], [k]: v } }));
    setDirty(true);
  };

  const results = useMemo(
    () =>
      lines.map((l) => {
        const r = rows[l.id];
        const edit: LineEdit = {
          daysWorked: int(r.days),
          overtime50Hours: int(r.h50),
          overtime100Hours: int(r.h100),
          bonusCents: toCents(r.bonus),
          otherDeductionsCents: toCents(r.deductions),
          incomeTaxCents: r.tax.trim() === "" ? null : toCents(r.tax),
        };
        const valid = Object.values(edit).every((v) => v === null || (Number.isFinite(v) && v >= 0)) && edit.daysWorked <= 30;
        return { l, edit, valid, c: computeLine(l.terms, { ...edit, incomeTaxCents: edit.incomeTaxCents }, period) };
      }),
    [rows, lines, period],
  );
  const sum = (f: (x: (typeof results)[number]["c"]) => number) => results.reduce((a, x) => a + f(x.c), 0);
  const allValid = results.every((x) => x.valid && x.c.netCents >= 0);

  function save() {
    start(async () => {
      try {
        await savePayrollDraft(runId, Object.fromEntries(results.map((x) => [x.l.id, x.edit])));
        setDirty(false);
        toast.success("Rol guardado y recalculado");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[1080px] text-sm">
          <thead>
            <tr className="border-b bg-stone-50/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Trabajador</th>
              <th className="w-16 px-1 py-2.5 text-right font-medium">Días</th>
              <th className="w-16 px-1 py-2.5 text-right font-medium">H. 50 %</th>
              <th className="w-16 px-1 py-2.5 text-right font-medium">H. 100 %</th>
              <th className="w-24 px-1 py-2.5 text-right font-medium">Bonos $</th>
              <th className="px-2 py-2.5 text-right font-medium">Ingresos</th>
              <th className="px-2 py-2.5 text-right font-medium">IESS 9,45 %</th>
              <th className="w-24 px-1 py-2.5 text-right font-medium">Ret. IR $</th>
              <th className="w-24 px-1 py-2.5 text-right font-medium">Descuentos $</th>
              <th className="px-2 py-2.5 text-right font-medium">Beneficios en el rol</th>
              <th className="px-3 py-2.5 text-right font-medium">Neto</th>
            </tr>
          </thead>
          <tbody>
            {results.map(({ l, c, valid }) => {
              const r = rows[l.id];
              const inRol =
                (l.terms.monthlyDecimoTercero ? c.decimoTerceroCents : 0) +
                (l.terms.monthlyDecimoCuarto ? c.decimoCuartoCents : 0) +
                (l.terms.monthlyFondosReserva ? c.fondosReservaCents : 0);
              const cell = (k: keyof Row, placeholder?: string) => (
                <input className={inputCls} value={r[k]} disabled={!editable} placeholder={placeholder} inputMode="decimal" onChange={(e) => set(l.id, k, e.target.value)} />
              );
              return (
                <tr key={l.id} className={`border-b last:border-0 ${!valid || c.netCents < 0 ? "bg-red-50" : ""}`}>
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/finanzas/trabajadores/roles/${runId}/recibo/${l.id}`} className="font-medium hover:underline">{l.name}</Link>
                    <p className="text-xs text-muted-foreground">{l.position ?? "—"} · sueldo {money(l.terms.monthlySalaryCents)}{l.terms.iessAffiliated ? "" : " · sin IESS"}</p>
                  </td>
                  <td className="px-1 py-2">{cell("days")}</td>
                  <td className="px-1 py-2">{cell("h50")}</td>
                  <td className="px-1 py-2">{cell("h100")}</td>
                  <td className="px-1 py-2">{cell("bonus")}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(c.grossCents)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">−{money(c.iessPersonalCents)}</td>
                  <td className="px-1 py-2">{cell("tax", money(c.suggestedIncomeTaxCents))}</td>
                  <td className="px-1 py-2">{cell("deductions")}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{inRol ? `+${money(inRol)}` : "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(c.netCents)}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 bg-stone-50/60 font-semibold">
              <td className="px-3 py-2.5">Total</td>
              <td colSpan={4} />
              <td className="px-2 py-2.5 text-right tabular-nums">{money(sum((c) => c.grossCents))}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">−{money(sum((c) => c.iessPersonalCents))}</td>
              <td className="px-1 py-2.5 text-right tabular-nums">{money(sum((c) => c.incomeTaxCents))}</td>
              <td colSpan={2} />
              <td className="px-3 py-2.5 text-right tabular-nums">{money(sum((c) => c.netCents))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>La retención de IR vacía usa la sugerida (proyección anual sin gastos personales). Descuentos: préstamos del IESS, pensiones, etc.</span>
          <Button type="button" onClick={save} disabled={pending || !dirty || !allValid}>
            {pending ? "Guardando…" : dirty ? "Guardar y recalcular" : "Guardado"}
          </Button>
        </div>
      )}
    </div>
  );
}
