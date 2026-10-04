"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkSriKeys, importSriFiles, importSriKeys } from "@/lib/actions/sri";
import { extractAccessKeys } from "@/lib/finance/sri-xml";
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

function Results({ results }: { results: SriOutcome[] }) {
  return (
    <div className="max-h-96 overflow-auto rounded-md border">
      <table className="w-full text-xs">
        <tbody>
          {results.map((r, i) => (
            <tr key={r.accessKey || i} className="border-b last:border-0">
              <td className={`whitespace-nowrap px-2 py-1.5 font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</td>
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
  );
}

function summary(all: SriOutcome[]) {
  const n = (st: SriOutcome["status"]) => all.filter((r) => r.status === st).length;
  return `${n("created")} nuevas · ${n("linked")} enlazadas al banco · ${n("duplicate")} ya estaban · ${n("rejected")} no se importaron`;
}

const KEYS_PER_CALL = 8;

/** Supplier name next to each key in the report (tab- or semicolon-separated, any column order). */
function namesFromReports(texts: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of texts) {
    for (const line of t.split(/\r?\n/)) {
      const keys = extractAccessKeys(line);
      if (!keys.length) continue;
      const cols = line.split(/\t|;/).map((c) => c.trim());
      const name = cols.find((c) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/.test(c) && !/^(factura|liquidaci|nota|comprobante|retenci|gu[ií]a)/i.test(c));
      if (name) out.set(keys[0], name);
    }
  }
  return out;
}

/** Recommended path: the SRI "recibidos" report(s) → the app fetches every missing XML from the SRI. */
function FromReport() {
  const [pending, start] = useTransition();
  const [sede, setSede] = useState<string>(ENTITY_ORDER[0]);
  const [report, setReport] = useState<CompletenessReport | null>(null);
  const [results, setResults] = useState<SriOutcome[]>([]);
  const [done, setDone] = useState<number | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [skip, setSkip] = useState<Set<string>>(new Set());

  function onCheck(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("reports") as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return toast.error("Elige el reporte (.txt) de SRI en Línea.");
    start(async () => {
      try {
        const texts = await Promise.all(files.map((f) => f.text()));
        const keys = [...new Set(texts.flatMap((t) => extractAccessKeys(t)))];
        if (keys.length === 0) throw new Error("No encontré claves de acceso en esos archivos.");
        setNames(namesFromReports(texts));
        setReport(await checkSriKeys(keys));
        setSkip(new Set());
        setResults([]);
        setDone(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo revisar el reporte.");
      }
    });
  }

  function fetchMissing(keys: string[]) {
    start(async () => {
      const all: SriOutcome[] = [];
      setResults([]);
      setDone(0);
      try {
        for (let i = 0; i < keys.length; i += KEYS_PER_CALL) {
          all.push(...(await importSriKeys(sede, keys.slice(i, i + KEYS_PER_CALL))));
          setResults([...all]);
          setDone(Math.min(i + KEYS_PER_CALL, keys.length));
        }
        toast.success(summary(all));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Se cortó la importación: vuelve a revisar el reporte y continúa.");
      }
    });
  }

  const missingKeys = report?.missing.map((m) => m.key).filter((k) => !skip.has(k)) ?? [];
  const toggle = (k: string) => setSkip((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const retry = results.filter((r) => r.status === "rejected" && /no respondió/.test(r.detail)).map((r) => r.accessKey);

  return (
    <section className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Desde el reporte del SRI <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">recomendado</span></p>
        <p className="text-xs text-muted-foreground">
          En SRI en Línea › Facturación electrónica › Comprobantes electrónicos recibidos, consulta cada mes y usa «Descargar listado» (.txt).
          Hazlo con el RUC de cada empresa. Sube aquí uno o varios meses: la app trae cada factura del SRI y la registra como gasto.
        </p>
      </div>
      <form onSubmit={onCheck} className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs">Si no se reconoce el comprador</Label>
          <select value={sede} onChange={(e) => setSede(e.target.value)} className={selectCls}>
            {ENTITY_ORDER.map((s) => <option key={s} value={s}>{ENTITIES[s].name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Reportes del SRI (.txt)</Label>
          <Input name="reports" type="file" accept=".txt,.csv,text/plain" multiple />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>Revisar</Button>
      </form>

      {report && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
          <p>
            {report.totalKeys} comprobantes en el reporte: <b>{report.imported}</b> ya están en la app
            {report.notExpenses ? `, ${report.notExpenses} no son gastos (retenciones, notas de crédito u otros)` : ""}
            {report.missing.length ? <> y faltan <b>{report.missing.length}</b>.</> : ". No falta ninguno."}
          </p>
          {report.missing.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" disabled={pending || missingKeys.length === 0} onClick={() => fetchMissing(missingKeys)}>
                {pending && done !== null ? `Importando ${done} de ${missingKeys.length}…` : `Traer del SRI e importar ${missingKeys.length}`}
              </Button>
              {done === null && (
                <span className="text-muted-foreground">
                  Desmarca las compras personales.{" "}
                  <button type="button" className="text-primary hover:underline" onClick={() => setSkip(new Set())}>Todas</button> ·{" "}
                  <button type="button" className="text-primary hover:underline" onClick={() => setSkip(new Set(report.missing.map((m) => m.key)))}>Ninguna</button>
                </span>
              )}
              {done !== null && missingKeys.length > 0 && (
                <div className="h-2 w-48 overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${(done / missingKeys.length) * 100}%` }} />
                </div>
              )}
            </div>
          )}
          {done === null && report.missing.length > 0 && (
            <ul className="max-h-80 divide-y overflow-auto rounded-md border bg-background">
              {report.missing.map((m) => (
                <li key={m.key}>
                  <label className={`flex flex-wrap items-center gap-x-3 px-2 py-1.5 ${skip.has(m.key) ? "text-muted-foreground line-through" : ""}`}>
                    <input type="checkbox" checked={!skip.has(m.key)} onChange={() => toggle(m.key)} />
                    <span className="tabular-nums">{m.issueDate.toISOString().slice(0, 10)}</span>
                    <span className="font-medium">{names.get(m.key) ?? `RUC ${m.issuerRuc}`}</span>
                    <span className="text-muted-foreground">{m.codName} {m.docNumber}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{summary(results)}</p>
          {!pending && retry.length > 0 && (
            <Button size="xs" variant="outline" onClick={() => fetchMissing(retry)}>Reintentar {retry.length} que el SRI no respondió</Button>
          )}
          <Results results={results} />
        </div>
      )}
    </section>
  );
}

/** Fallback: XML files from the supplier's email or downloaded one by one. */
function FromXml() {
  const [pending, start] = useTransition();
  const [results, setResults] = useState<SriOutcome[] | null>(null);
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
        toast.success(summary(all));
        form.reset();
      } catch (err) {
        if (all.length) setResults(all);
        toast.error(err instanceof Error ? err.message : "No se pudo importar.");
      } finally {
        setProgress("");
      }
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Subir los XML</p>
        <p className="text-xs text-muted-foreground">Los que llegan por correo, o los que el SRI no devuelva por clave.</p>
      </div>
      <form onSubmit={onImport} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]">
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
        <p className="text-[11px] text-muted-foreground">Si la factura está a nombre de la otra entidad (por su RUC o cédula), va a esa entidad sola.</p>
        <div className="flex items-center justify-end gap-3">
          {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Importando…" : "Importar XML"}</Button>
        </div>
      </form>
      {results && <Results results={results} />}
    </section>
  );
}

export function SriImportPanel() {
  return (
    <div className="space-y-6">
      <FromReport />
      <div className="border-t pt-5">
        <FromXml />
      </div>
    </div>
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
