"use client";

import { textMatches } from "@/lib/text";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressImage } from "@/components/nutrition/photo-upload";
import { readReceiptAction, saveExpense } from "@/lib/actions/expenses";
import { DOC_TYPE_LABELS, ENTITIES, PAY_METHOD_LABELS } from "@/lib/finance/entities";
import { ASSET_LINE_CODES, hasIvaCredit, ivaFor } from "@/lib/expenses/core";
import { fmtUsd } from "@/lib/invoicing/core";
import type { ExpenseDocType, ExpensePayMethod, Sede } from "@/generated/prisma/enums";

type Account = { code: string; name: string };
type Line = { key: number; accountCode: string; description: string; subtotal: string; ivaRate: number; iva: string; ivaTouched: boolean };

/** A supplier of the directory, for the picker. */
export type SupplierOpt = { id: string; name: string; tradeName: string | null; taxId: string | null; defaultAccountCode: string | null; paymentTermsDays: number | null };

export type EditorExpense = {
  id: string;
  sede: Sede;
  supplierId: string | null;
  supplierName: string | null;
  supplierRuc: string | null;
  documentType: ExpenseDocType;
  documentNumber: string | null;
  sriAccessKey: string | null;
  date: string;
  paid: boolean;
  paymentMethod: ExpensePayMethod | null;
  paidAt: string | null;
  dueDate: string | null;
  notes: string | null;
  receiptPath: string | null;
  lines: { accountCode: string; description: string; subtotalCents: number; ivaRate: number; ivaCents: number }[];
};

const selectCls = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";
const toCents = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && v.trim() !== "" ? Math.round(n * 100) : NaN;
};
const dollars = (c: number) => (c / 100).toFixed(2);
let nextKey = 1;

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function ExpenseEditor({
  sedes,
  accounts,
  initial,
  today,
  isAdmin,
  suppliers = [],
  presetSupplierId = null,
}: {
  sedes: Sede[];
  accounts: Record<Sede, Account[]>;
  initial: EditorExpense | null;
  today: string;
  isAdmin: boolean;
  suppliers?: SupplierOpt[];
  /** "Registrar gasto" from a supplier's page. */
  presetSupplierId?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reading, setReading] = useState(false);

  const [sede, setSede] = useState<Sede>(initial?.sede ?? sedes[0]);
  const preset = suppliers.find((x) => x.id === presetSupplierId) ?? null;
  const [supplierId, setSupplierId] = useState<string | null>(initial?.supplierId ?? preset?.id ?? null);
  const [supplierName, setSupplierName] = useState(initial?.supplierName ?? preset?.name ?? "");
  const [supplierRuc, setSupplierRuc] = useState(initial?.supplierRuc ?? preset?.taxId ?? "");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [documentType, setDocumentType] = useState<ExpenseDocType>(initial?.documentType ?? "FACTURA");
  const [documentNumber, setDocumentNumber] = useState(initial?.documentNumber ?? "");
  const [accessKey, setAccessKey] = useState(initial?.sriAccessKey ?? "");
  const [date, setDate] = useState(initial?.date ?? today);
  const [paid, setPaid] = useState(initial?.paid ?? true);
  const [paymentMethod, setPaymentMethod] = useState<ExpensePayMethod>(initial?.paymentMethod ?? "CASH");
  const [paidAt, setPaidAt] = useState(initial?.paidAt ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [receiptPath, setReceiptPath] = useState<string | null>(initial?.receiptPath ?? null);
  const [preview, setPreview] = useState<{ url: string; pdf: boolean } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const acctList = accounts[sede] ?? [];
  const defaultAccount = acctList.find((a) => a.code === "5.3.05")?.code ?? acctList[0]?.code ?? "";
  const presetAccount = preset?.defaultAccountCode && acctList.some((a) => a.code === preset.defaultAccountCode) ? preset.defaultAccountCode : null;
  const blank = (): Line => ({ key: nextKey++, accountCode: presetAccount ?? defaultAccount, description: "", subtotal: "", ivaRate: 15, iva: "", ivaTouched: false });
  const [lines, setLines] = useState<Line[]>(
    initial?.lines.length
      ? initial.lines.map((l) => ({ key: nextKey++, accountCode: l.accountCode, description: l.description, subtotal: dollars(l.subtotalCents), ivaRate: l.ivaRate, iva: dollars(l.ivaCents), ivaTouched: true }))
      : [blank()],
  );
  const credit = hasIvaCredit(documentType);

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const n = { ...l, ...patch };
        // IVA follows the base until the user types their own (receipts differ by a cent).
        if (!n.ivaTouched && ("subtotal" in patch || "ivaRate" in patch)) {
          const c = toCents(n.subtotal);
          n.iva = Number.isNaN(c) ? "" : dollars(ivaFor(c, n.ivaRate));
        }
        return n;
      }),
    );

  const computed = useMemo(
    () =>
      lines.map((l) => {
        const sub = toCents(l.subtotal);
        const iva = credit ? toCents(l.iva || "0") : 0;
        return { ok: !Number.isNaN(sub) && sub > 0 && !Number.isNaN(iva) && iva >= 0, sub, iva };
      }),
    [lines, credit],
  );
  const subtotal = computed.reduce((a, c) => a + (c.ok ? c.sub : 0), 0);
  const ivaTotal = computed.reduce((a, c) => a + (c.ok ? c.iva : 0), 0);
  const allOk = computed.length > 0 && computed.every((c) => c.ok);

  async function onFile(file: File) {
    setReading(true);
    setWarnings([]);
    setAiNote(null);
    try {
      const isPdf = file.type === "application/pdf";
      const upload = isPdf ? file : await compressImage(file);
      if (upload.size > 1024 * 1024) throw new Error("El archivo pesa más de 1 MB.");
      setPreview({ url: URL.createObjectURL(upload), pdf: isPdf });
      const fd = new FormData();
      fd.set("sede", sede);
      fd.set("file", upload);
      const r = await readReceiptAction(fd);
      setReceiptPath(r.receiptPath);
      const x = r.reading;
      if (x.supplierName) {
        setSupplierName(x.supplierName);
        setSupplierId(null);
      }
      if (x.supplierRuc) setSupplierRuc(x.supplierRuc);
      setDocumentType(x.documentType);
      if (x.documentNumber) setDocumentNumber(x.documentNumber);
      if (x.accessKey) setAccessKey(x.accessKey);
      if (x.issueDate && x.issueDate <= today) setDate(x.issueDate);
      if (x.paymentMethod) {
        setPaid(true);
        setPaymentMethod(x.paymentMethod);
      }
      if (x.lines.length) {
        setLines(
          x.lines.map((l) => ({
            key: nextKey++,
            accountCode: acctList.some((a) => a.code === l.accountCode) ? l.accountCode : defaultAccount,
            description: l.description,
            subtotal: dollars(l.subtotalCents),
            ivaRate: l.ivaRate === 0 ? 0 : 15,
            iva: dollars(l.ivaCents),
            ivaTouched: true,
          })),
        );
      }
      setWarnings(r.warnings);
      setAiNote(x.notes);
      toast.success("Comprobante leído: revisa los datos antes de guardar");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el comprobante.");
    } finally {
      setReading(false);
    }
  }

  const supplierMatches = useMemo(
    () => (supplierId ? [] : suppliers.filter((x) => textMatches(`${x.name} ${x.tradeName ?? ""} ${x.taxId ?? ""}`, supplierName)).slice(0, 6)),
    [supplierName, supplierId, suppliers],
  );

  function pickSupplier(x: SupplierOpt) {
    setSupplierId(x.id);
    setSupplierName(x.name);
    setSupplierRuc(x.taxId ?? "");
    setSupplierOpen(false);
    // Its usual account on lines nobody has filled yet, and the due date from its terms.
    if (x.defaultAccountCode && acctList.some((a) => a.code === x.defaultAccountCode)) {
      setLines((ls) => ls.map((l) => (!l.description && !l.subtotal ? { ...l, accountCode: x.defaultAccountCode! } : l)));
    }
    if (x.paymentTermsDays != null && x.paymentTermsDays > 0) {
      setPaid(false);
      const due = new Date(`${date}T00:00:00Z`);
      due.setUTCDate(due.getUTCDate() + x.paymentTermsDays);
      setDueDate(due.toISOString().slice(0, 10));
    }
  }

  function submit() {
    if (!allOk) return toast.error("Revisa los montos de las líneas.");
    start(async () => {
      try {
        await saveExpense({
          id: initial?.id,
          sede,
          supplierId,
          supplierName,
          supplierRuc,
          documentType,
          documentNumber,
          accessKey,
          date,
          paid,
          paymentMethod: paid ? paymentMethod : undefined,
          paidAt: paid && paidAt ? paidAt : undefined,
          dueDate: !paid && dueDate ? dueDate : undefined,
          notes,
          receiptPath,
          lines: lines.map((l, i) => ({
            accountCode: l.accountCode,
            description: l.description,
            subtotalCents: computed[i].sub,
            ivaRate: credit ? l.ivaRate : 0,
            ivaCents: computed[i].iva,
          })),
        });
        toast.success(isAdmin ? "Gasto registrado: queda por revisar" : "Gasto guardado");
        router.push(presetSupplierId ? `/dashboard/finanzas/proveedores/${presetSupplierId}` : `/dashboard/gastos?mes=${date.slice(0, 7)}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  const expenseAccts = acctList.filter((a) => !ASSET_LINE_CODES.includes(a.code));
  const assetAccts = acctList.filter((a) => ASSET_LINE_CODES.includes(a.code));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Entidad">
              <select className={selectCls} value={sede} onChange={(e) => setSede(e.target.value as Sede)} disabled={sedes.length === 1 || !!initial}>
                {sedes.map((s) => (
                  <option key={s} value={s}>{ENTITIES[s].name}</option>
                ))}
              </select>
            </Field>
            <Field label="Proveedor" className="relative sm:col-span-2">
              <Input
                className="h-8"
                value={supplierName}
                onChange={(e) => {
                  setSupplierName(e.target.value);
                  setSupplierId(null);
                  setSupplierOpen(true);
                }}
                onFocus={() => setSupplierOpen(true)}
                onBlur={() => setTimeout(() => setSupplierOpen(false), 150)}
                placeholder="Megamaxi, Kywi, ferretería…"
              />
              {supplierOpen && supplierMatches.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md">
                  {supplierMatches.map((x) => (
                    <button key={x.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickSupplier(x)} className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                      <span className="truncate">{x.tradeName ?? x.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{x.taxId ?? "sin RUC"}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {supplierId ? "Del directorio de proveedores." : supplierName.trim() ? "Proveedor nuevo: se agrega solo al directorio." : "Escribe para buscar en el directorio."}
              </p>
            </Field>
            <Field label="RUC / cédula del proveedor">
              <Input
                className="h-8"
                inputMode="numeric"
                value={supplierRuc}
                onChange={(e) => {
                  setSupplierRuc(e.target.value.replace(/\D/g, ""));
                  setSupplierId(null);
                }}
              />
            </Field>
            <Field label="Documento">
              <select className={selectCls} value={documentType} onChange={(e) => setDocumentType(e.target.value as ExpenseDocType)}>
                {(Object.keys(DOC_TYPE_LABELS) as ExpenseDocType[]).map((d) => (
                  <option key={d} value={d}>{DOC_TYPE_LABELS[d]}</option>
                ))}
              </select>
            </Field>
            <Field label="Número">
              <Input className="h-8" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="001-001-000000123" />
            </Field>
            <Field label="Fecha del documento">
              <Input type="date" className="h-8" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Clave de acceso (si la tiene)" className="sm:col-span-2">
              <Input className="h-8 font-mono text-xs" inputMode="numeric" value={accessKey} onChange={(e) => setAccessKey(e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
          {!credit && (
            <p className="text-[11px] text-muted-foreground">
              Sin factura el IVA no se recupera: se registra el monto total como gasto.
            </p>
          )}
        </div>

        <div className="rounded-lg border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold">¿Qué se compró?</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-56 py-1 pr-2 font-medium">Cuenta</th>
                  <th className="py-1 pr-2 font-medium">Descripción</th>
                  <th className="w-24 py-1 pr-2 font-medium">{credit ? "Subtotal" : "Monto"}</th>
                  {credit && <th className="w-16 py-1 pr-2 font-medium">IVA %</th>}
                  {credit && <th className="w-20 py-1 pr-2 font-medium">IVA</th>}
                  <th className="w-20 py-1 text-right font-medium">Total</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const c = computed[i];
                  return (
                    <tr key={l.key} className="border-t align-top">
                      <td className="py-2 pr-2">
                        <select className={selectCls} value={l.accountCode} onChange={(e) => update(l.key, { accountCode: e.target.value })}>
                          <optgroup label="Gastos">
                            {expenseAccts.map((a) => (
                              <option key={a.code} value={a.code}>{a.name}</option>
                            ))}
                          </optgroup>
                          {assetAccts.length > 0 && (
                            <optgroup label="Activos (equipos, obras, anticipos)">
                              {assetAccts.map((a) => (
                                <option key={a.code} value={a.code}>{a.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <Input className="h-8" value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="Ej.: magnesio, arreglo de la caminadora" />
                      </td>
                      <td className="py-2 pr-2">
                        <Input className="h-8" inputMode="decimal" value={l.subtotal} onChange={(e) => update(l.key, { subtotal: e.target.value })} placeholder="0.00" />
                      </td>
                      {credit && (
                        <td className="py-2 pr-2">
                          <select className={selectCls} value={l.ivaRate} onChange={(e) => update(l.key, { ivaRate: Number(e.target.value), ivaTouched: false })}>
                            <option value={15}>15</option>
                            <option value={0}>0</option>
                          </select>
                        </td>
                      )}
                      {credit && (
                        <td className="py-2 pr-2">
                          <Input className="h-8" inputMode="decimal" value={l.iva} onChange={(e) => update(l.key, { iva: e.target.value, ivaTouched: true })} />
                        </td>
                      )}
                      <td className="py-2 text-right tabular-nums">{c.ok ? fmtUsd(c.sub + c.iva) : "—"}</td>
                      <td className="py-2 text-right">
                        {lines.length > 1 && (
                          <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Quitar línea">
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, blank()])}>
              + Línea
            </Button>
            <dl className="min-w-56 space-y-1 text-sm">
              {credit && (
                <>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{fmtUsd(subtotal)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">IVA</dt><dd className="tabular-nums">{fmtUsd(ivaTotal)}</dd></div>
                </>
              )}
              <div className="flex justify-between border-t pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{fmtUsd(subtotal + ivaTotal)}</dd></div>
            </dl>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5 space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={paid} onChange={() => setPaid(true)} /> Ya se pagó</label>
            <label className="flex items-center gap-2"><input type="radio" checked={!paid} onChange={() => setPaid(false)} /> Por pagar</label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {paid ? (
              <>
                <Field label="Cómo se pagó">
                  <select className={selectCls} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as ExpensePayMethod)}>
                    {(Object.keys(PAY_METHOD_LABELS) as ExpensePayMethod[]).map((m) => (
                      <option key={m} value={m}>{PAY_METHOD_LABELS[m]}{m === "CASH" ? " (caja chica)" : ""}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Fecha de pago (si es otra)">
                  <Input type="date" className="h-8" value={paidAt} max={today} onChange={(e) => setPaidAt(e.target.value)} />
                </Field>
              </>
            ) : (
              <Field label="Vence">
                <Input type="date" className="h-8" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
            )}
            <Field label="Notas" className={paid ? "" : "sm:col-span-2"}>
              <Input className="h-8" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Quién lo pidió, para qué…" />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={pending || reading || !allOk || !supplierName.trim()}>
            {pending ? "Guardando…" : initial ? "Guardar cambios" : "Registrar gasto"}
          </Button>
        </div>
      </div>

      {/* Receipt */}
      <aside className="space-y-3">
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Comprobante</h2>
          <label className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-6 text-center text-sm hover:bg-muted/50 ${reading ? "pointer-events-none opacity-60" : ""}`}>
            <span className="font-medium">{reading ? "Leyendo con IA…" : receiptPath ? "Cambiar foto o PDF" : "Subir foto o PDF"}</span>
            <span className="text-xs text-muted-foreground">La IA llena proveedor, número, fecha, líneas e IVA</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {preview && !preview.pdf && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt="Comprobante" className="w-full rounded-md border" />
          )}
          {preview?.pdf && <p className="text-xs text-muted-foreground">PDF adjunto.</p>}
          {!preview && receiptPath && <p className="text-xs text-muted-foreground">Comprobante adjunto.</p>}
          {warnings.length > 0 && (
            <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {warnings.map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
          )}
          {aiNote && <p className="text-xs text-muted-foreground">Nota de la IA: {aiNote}</p>}
        </div>
        {isAdmin && (
          <p className="text-xs text-muted-foreground">
            Lo que registres queda “por revisar” hasta que Isabel lo confirme. Puedes corregirlo o anularlo mientras tanto.
          </p>
        )}
      </aside>
    </div>
  );
}
