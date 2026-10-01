"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { checkSriReport, importSriFiles } from "@/lib/actions/sri";
import { updateExpenseCategory } from "@/lib/actions/finance";
import type { CompletenessReport, SriOutcome } from "@/lib/finance/sri-core";
import { ENTITIES, ENTITY_ORDER, EXPENSE_CATEGORY_LABELS, fmtMoney } from "@/lib/finance/entities";
import type { ExpenseCategory } from "@/generated/prisma/enums";

const selectCls = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";

const STATUS: Record<SriOutcome["status"], { label: string; cls: string }> = {
  created: { label: "Nueva", cls: "text-emerald-700" },
  linked: { label: "Enlazada", cls: "text-emerald-700" },
  duplicate: { label: "Ya estaba", cls: "text-muted-foreground" },
  rejected: { label: "No se importó", cls: "text-red-700" },
};

/** Server actions take ≤ 1 MB: send the XML in batches. */
function batches(files: File[], maxBytes = 850 * 1024, maxFiles = 40): File[][] {
  const out: File[][] = [];
  let cur: File[] = [];
  let size = 0;
  for (const f of files) {
    if (cur.length && (size + f.size > maxBytes || cur.length >= maxFiles)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(f);
    size += f.size;
  }
  if (cur.length) out.push(cur);
  return out;
}

export function SriImportDialog() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [results, setResults] = useState<SriOutcome[] | null>(null);
  const [report, setReport] = useState<CompletenessReport | null>(null);
  const [progress, setProgress] = useState("");

  function onImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const sede = String(new FormData(form).get("sede"));
    const input = form.elements.namedItem("files") as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return toast.error("Elige los XML de las facturas.");
    const big = files.find((f) => f.size > 800 * 1024);
    if (big) return toast.error(`${big.name} pesa demasiado para ser un XML de factura.`);
    start(async () => {
      const all: SriOutcome[] = [];
      try {
        const parts = batches(files);
        for (let i = 0; i < parts.length; i++) {
          setProgress(parts.length > 1 ? `Lote ${i + 1} de ${parts.length}…` : "");
          const fd = new FormData();
          fd.set("sede", sede);
          parts[i].forEach((f) => fd.append("files", f));
          all.push(...(await importSriFiles(fd)));
        }
        setResults(all);
        const ok = all.filter((r) => r.status === "created" || r.status === "linked").length;
        toast.success(`${ok} de ${all.length} facturas importadas.`);
        form.reset();
      } catch (err) {
        if (all.length) setResults(all);
        toast.error(err instanceof Error ? err.message : "No se pudo importar.");
      } finally {
        setProgress("");
      }
    });
  }

  function onCheck(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      try {
        setReport(await checkSriReport(fd));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo revisar el reporte.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setResults(null); setReport(null); } }}>
      <DialogTrigger className="inline-flex">
        <Button size="sm" variant="outline">Facturas del SRI</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Facturas recibidas del SRI</DialogTitle>
          <DialogDescription>
            Sube los XML (del correo o de SRI en Línea › Comprobantes electrónicos recibidos). Cada factura queda como
            gasto con su IVA; si ya entró el débito del banco por el mismo monto, se enlaza a ese gasto.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onImport} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Entidad</Label>
              <select name="sede" className={selectCls}>
                {ENTITY_ORDER.map((s) => <option key={s} value={s}>{ENTITIES[s].name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Archivos XML</Label>
              <Input name="files" type="file" accept=".xml,application/xml,text/xml" multiple />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Si la factura está a nombre de la otra entidad (por su RUC o cédula), va a esa entidad sola.
          </p>
          <div className="flex items-center justify-end gap-3">
            {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Importando…" : "Importar XML"}</Button>
          </div>
        </form>

        {results && (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.accessKey || i} className="border-b last:border-0">
                    <td className={`px-2 py-1.5 whitespace-nowrap font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</td>
                    <td className="px-2 py-1.5">
                      {r.issuerName}
                      {r.docNumber && <span className="text-muted-foreground"> · {r.docNumber}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.totalCents ? fmtMoney(r.totalCents, { decimals: true }) : ""}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {r.detail}
                      {r.sede && ` · ${ENTITIES[r.sede].name.replace("La Cueva ", "")}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium">¿Falta alguna?</p>
          <p className="text-xs text-muted-foreground">
            Descarga en SRI en Línea el reporte de comprobantes recibidos del mes (.txt) y súbelo: te digo qué facturas
            tiene el SRI que todavía no están aquí.
          </p>
          <form onSubmit={onCheck} className="flex flex-wrap items-end gap-2">
            <Input name="file" type="file" accept=".txt,.csv,text/plain" className="max-w-xs" />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>Revisar reporte</Button>
          </form>
          {report && (
            <div className="text-xs space-y-2">
              <p>
                El reporte tiene {report.totalKeys} comprobantes: {report.imported} ya están en la app
                {report.notExpenses ? `, ${report.notExpenses} no son gastos (retenciones u otros)` : ""}
                {report.missing.length ? ` y faltan ${report.missing.length}:` : ". No falta ninguno."}
              </p>
              {report.missing.length > 0 && (
                <ul className="rounded-md border divide-y">
                  {report.missing.map((m) => (
                    <li key={m.key} className="px-2 py-1.5 flex flex-wrap gap-x-3">
                      <span className="tabular-nums">{m.issueDate.toISOString().slice(0, 10)}</span>
                      <span>{m.codName} {m.docNumber}</span>
                      <span className="text-muted-foreground">RUC {m.issuerRuc}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CategorySelect({ id, value, flagged }: { id: string; value: ExpenseCategory; flagged: boolean }) {
  const [pending, start] = useTransition();
  return (
    <select
      defaultValue={value}
      disabled={pending}
      aria-label="Categoría"
      className={`h-7 rounded-md border bg-background px-1.5 text-xs ${flagged ? "border-amber-400 bg-amber-50" : "border-input"}`}
      onChange={(e) => {
        const category = e.target.value as ExpenseCategory;
        start(async () => {
          try {
            await updateExpenseCategory(id, category);
            toast.success("Categoría actualizada. Las próximas facturas de este proveedor la usarán.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "No se pudo actualizar.");
          }
        });
      }}
    >
      {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
        <option key={k} value={k}>{v}</option>
      ))}
    </select>
  );
}
