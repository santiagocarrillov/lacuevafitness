"use client";

import { useRouter } from "next/navigation";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  applySafeSuggestions,
  classifyLine,
  createBankAccount,
  deactivateRule,
  importStatement,
  undoLine,
} from "@/lib/actions/bank";
import type { InboxLine } from "@/lib/finance/bank-core";
import { decisionLabel, type Decision } from "@/lib/finance/bank-suggest";
import {
  CAPITAL_KIND_LABELS,
  ENTITIES,
  ENTITY_ORDER,
  EXPENSE_CATEGORY_LABELS,
  OTHER_INCOME_LABELS,
  fmtMoney,
} from "@/lib/finance/entities";
import type {
  CapitalKind,
  ExpenseCategory,
  OtherIncomeCategory,
} from "@/generated/prisma/enums";

const selectCls = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : "No se pudo completar.";
}

// ── Accounts & import ───────────────────────────────────────────────────────

export function AccountForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const done = () => router.push("/dashboard/finanzas/banco");
  return (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              try {
                await createBankAccount(fd);
                toast.success("Cuenta creada.");
                done();
              } catch (err) {
                toast.error(errMsg(err));
              }
            });
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs">Nombre</Label>
            <Input name="name" placeholder="Pichincha Santiago" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Banco</Label>
              <select name="statementFormat" className={selectCls} required>
                <option value="PACIFICO">Banco del Pacífico</option>
                <option value="PICHINCHA">Banco Pichincha</option>
                <option value="PRODUBANCO">Produbanco</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Últimos 4 dígitos</Label>
              <Input name="last4" inputMode="numeric" maxLength={4} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Entidad</Label>
              <select name="sede" className={selectCls} required>
                {ENTITY_ORDER.map((s) => (
                  <option key={s} value={s}>{ENTITIES[s].name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <select name="kind" className={selectCls}>
                <option value="BUSINESS">Del negocio</option>
                <option value="PERSONAL_MIXED">Personal (mezclada)</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={done}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={pending}>Guardar</Button>
          </div>
        </form>
  );
}

export function ImportForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        start(async () => {
          try {
            const r = await importStatement(fd);
            toast.success(
              `${r.created} movimientos nuevos (${r.from} → ${r.to})` +
                (r.duplicates ? ` · ${r.duplicates} ya estaban` : "") +
                (r.autoApplied ? ` · ${r.autoApplied} clasificados por reglas` : ""),
            );
            form.reset();
          } catch (err) {
            toast.error(errMsg(err));
          }
        });
      }}
    >
      <div className="space-y-1">
        <Label className="text-xs">Cuenta</Label>
        <select name="accountId" className={`${selectCls} min-w-48`} required>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Estado de cuenta (.xlsx)</Label>
        <Input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
      </div>
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Importando…" : "Importar"}</Button>
    </form>
  );
}

export function ApplySafeButton({ accountId, count }: { accountId?: string; count: number }) {
  const [pending, start] = useTransition();
  if (count === 0) return null;
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const n = await applySafeSuggestions(accountId);
            toast.success(`${n} movimientos clasificados.`);
          } catch (err) {
            toast.error(errMsg(err));
          }
        })
      }
    >
      {pending ? "Aplicando…" : `Aplicar sugerencias seguras (${count})`}
    </Button>
  );
}

// ── Inbox row ───────────────────────────────────────────────────────────────

type Mode = "MEMBER" | "UNASSIGNED" | "OTHER_INCOME" | "EXPENSE" | "CAPITAL" | "LOAN" | "PERSONAL" | "INTERNAL" | "IGNORE";

const CREDIT_MODES: { key: Mode; label: string }[] = [
  { key: "MEMBER", label: "Pago de socio" },
  { key: "UNASSIGNED", label: "Depósito sin asignar" },
  { key: "OTHER_INCOME", label: "Otro ingreso" },
  { key: "CAPITAL", label: "Dinero de los dueños" },
  { key: "PERSONAL", label: "Personal" },
  { key: "INTERNAL", label: "Entre cuentas" },
  { key: "IGNORE", label: "Ignorar" },
];
const DEBIT_MODES: { key: Mode; label: string }[] = [
  { key: "EXPENSE", label: "Gasto" },
  { key: "LOAN", label: "Cuota de préstamo" },
  { key: "CAPITAL", label: "Devolución / retiro" },
  { key: "PERSONAL", label: "Personal" },
  { key: "INTERNAL", label: "Entre cuentas" },
  { key: "IGNORE", label: "Ignorar" },
];

function modeOf(d: Decision | undefined, credit: boolean): Mode {
  switch (d?.type) {
    case "MEMBER_PAYMENTS": return "MEMBER";
    case "UNASSIGNED_DEPOSIT": return "UNASSIGNED";
    case "OTHER_INCOME": return "OTHER_INCOME";
    case "EXPENSE": return "EXPENSE";
    case "CAPITAL": return "CAPITAL";
    case "LOAN_PAYMENT": return "LOAN";
    case "PERSONAL": return "PERSONAL";
    case "INTERNAL_TRANSFER": return "INTERNAL";
    case "IGNORE": return "IGNORE";
    default: return credit ? "UNASSIGNED" : "EXPENSE";
  }
}

function day(d: Date) {
  return new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", timeZone: "America/Guayaquil" });
}

export function InboxRow({ line }: { line: InboxLine }) {
  const credit = line.amountCents > 0;
  const s = line.suggestion;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(modeOf(s?.decision, credit));
  const [pending, start] = useTransition();

  const initialIds = s?.decision.type === "MEMBER_PAYMENTS" ? s.decision.paymentIds : [];
  const [paymentIds, setPaymentIds] = useState<string[]>(initialIds);
  const isCard = s?.decision.type === "MEMBER_PAYMENTS" && !!s.decision.commission;

  function run(decision: Decision, remember?: { pattern: string }) {
    start(async () => {
      try {
        await classifyLine(line.id, decision, remember);
        toast.success(decisionLabel(decision));
      } catch (err) {
        toast.error(errMsg(err));
      }
    });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    const remember = fd.get("remember") ? { pattern: get("pattern") } : undefined;
    let d: Decision;
    switch (mode) {
      case "MEMBER": d = { type: "MEMBER_PAYMENTS", paymentIds, commission: !!fd.get("commission") }; break;
      case "UNASSIGNED": d = { type: "UNASSIGNED_DEPOSIT" }; break;
      case "OTHER_INCOME": d = { type: "OTHER_INCOME", category: get("otherCategory") as OtherIncomeCategory, description: get("description") }; break;
      case "EXPENSE": d = { type: "EXPENSE", category: get("category") as ExpenseCategory, description: get("description"), supplierName: get("supplierName") || undefined }; break;
      case "CAPITAL": d = { type: "CAPITAL", kind: get("capitalKind") as CapitalKind, person: get("person") }; break;
      case "LOAN": d = { type: "LOAN_PAYMENT", interestCents: Math.round(Number(get("interest").replace(",", ".") || 0) * 100) }; break;
      case "PERSONAL": d = { type: "PERSONAL" }; break;
      case "INTERNAL": d = { type: "INTERNAL_TRANSFER" }; break;
      default: d = { type: "IGNORE" };
    }
    run(d, remember);
  }

  const sd = s?.decision;
  const capitalKinds: CapitalKind[] = credit
    ? line.sede === "XTREME" ? ["SHAREHOLDER_LOAN", "CONTRIBUTION"] : ["CONTRIBUTION"]
    : line.sede === "XTREME" ? ["LOAN_REPAYMENT"] : ["WITHDRAWAL"];
  const selectedSum = line.candidates.filter((c) => paymentIds.includes(c.id)).reduce((a, c) => a + c.amountCents, 0);
  const canRemember = mode !== "MEMBER" && mode !== "UNASSIGNED" && mode !== "LOAN" && mode !== "IGNORE";

  return (
    <li className="border-b last:border-0 py-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        <div className="w-16 shrink-0 text-xs text-muted-foreground pt-0.5">{day(line.postedAt)}</div>
        <div className="flex-1 min-w-48">
          <p className="text-sm">{line.counterparty ?? line.description}</p>
          <p className="text-xs text-muted-foreground">
            {line.counterparty ? `${line.description} · ` : ""}{line.accountName}
          </p>
        </div>
        <div className={`w-24 text-right tabular-nums text-sm font-medium ${credit ? "text-emerald-700" : "text-red-700"}`}>
          {fmtMoney(line.amountCents, { decimals: true })}
        </div>
        <div className="flex items-center gap-2 basis-full md:basis-auto md:w-80 justify-end">
          {s && !open && (
            <>
              <span className={`text-xs rounded px-2 py-0.5 ${s.confident ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`} title={decisionLabel(s.decision)}>
                {s.reason}
              </span>
              {!(sd?.type === "MEMBER_PAYMENTS" && sd.paymentIds.length === 0) && (
                <Button size="xs" disabled={pending} onClick={() => run(s.decision)}>Aceptar</Button>
              )}
            </>
          )}
          <Button size="xs" variant="outline" onClick={() => setOpen((v) => !v)}>{open ? "Cerrar" : s ? "Otra" : "Clasificar"}</Button>
        </div>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-3 ml-0 md:ml-20 rounded-md border bg-muted/30 p-3 space-y-3">
          <div className="flex flex-wrap gap-1">
            {(credit ? CREDIT_MODES : DEBIT_MODES).map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`text-xs rounded-full border px-2.5 py-1 ${mode === m.key ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "MEMBER" && (
            <div className="space-y-2">
              {line.candidates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay pagos registrados que calcen. Usa «Depósito sin asignar» y recepción lo asigna en Pagos.
                </p>
              ) : (
                <ul className="space-y-1">
                  {line.candidates.map((c) => (
                    <li key={c.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={paymentIds.includes(c.id)}
                          onChange={(e) =>
                            setPaymentIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id)))
                          }
                        />
                        <span className="flex-1">
                          {c.memberName}
                          {c.depositorName && c.depositorName !== c.memberName && (
                            <span className="text-xs text-muted-foreground"> · deposita {c.depositorName}</span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">{c.paidAt ? day(c.paidAt) : "—"}</span>
                        <span className={`tabular-nums text-xs ${c.exactAmount ? "font-semibold" : ""}`}>
                          {fmtMoney(c.amountCents, { decimals: true })}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Seleccionado {fmtMoney(selectedSum, { decimals: true })} de {fmtMoney(line.amountCents, { decimals: true })}.
              </p>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="commission" defaultChecked={isCard} /> Liquidación de tarjeta: la diferencia es comisión
              </label>
            </div>
          )}

          {mode === "OTHER_INCOME" && (
            <div className="grid grid-cols-2 gap-2">
              <select name="otherCategory" className={selectCls} defaultValue={sd?.type === "OTHER_INCOME" ? sd.category : "OTHER"}>
                {Object.entries(OTHER_INCOME_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <Input name="description" defaultValue={sd?.type === "OTHER_INCOME" ? sd.description : line.counterparty ?? ""} placeholder="Descripción" />
            </div>
          )}

          {mode === "EXPENSE" && (
            <div className="grid grid-cols-2 gap-2">
              <select name="category" className={selectCls} defaultValue={sd?.type === "EXPENSE" ? sd.category : "OTHER"}>
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <Input name="description" defaultValue={sd?.type === "EXPENSE" ? sd.description : line.counterparty ?? line.description} placeholder="Descripción" />
              <Input name="supplierName" defaultValue={line.counterparty ?? ""} placeholder="Proveedor (opcional)" className="col-span-2" />
            </div>
          )}

          {mode === "CAPITAL" && (
            <div className="grid grid-cols-2 gap-2">
              <select name="person" className={selectCls} defaultValue={sd?.type === "CAPITAL" ? sd.person : undefined}>
                {ENTITIES[line.sede].owners.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select name="capitalKind" className={selectCls}>
                {capitalKinds.map((k) => <option key={k} value={k}>{CAPITAL_KIND_LABELS[k]}</option>)}
              </select>
            </div>
          )}

          {mode === "LOAN" && (
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Interés incluido (USD)</Label>
              <Input name="interest" inputMode="decimal" placeholder="0.00" className="w-32" />
              <span className="text-xs text-muted-foreground">El resto es capital: no es gasto.</span>
            </div>
          )}

          {mode === "PERSONAL" && (
            <p className="text-xs text-muted-foreground">Queda fuera de la contabilidad del gimnasio.</p>
          )}

          {canRemember && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="remember" /> Recordar para movimientos que contengan
              </label>
              <Input name="pattern" defaultValue={line.counterparty ?? line.description} className="h-7 w-64 text-xs" />
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
      )}
    </li>
  );
}

export function UndoButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-primary hover:underline"
      onClick={() =>
        start(async () => {
          try {
            await undoLine(id);
            toast.success("Deshecho: el movimiento volvió a la bandeja.");
          } catch (err) {
            toast.error(errMsg(err));
          }
        })
      }
    >
      Deshacer
    </button>
  );
}

export function RuleOffButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-red-700 hover:underline"
      onClick={() =>
        start(async () => {
          try {
            await deactivateRule(id);
            toast.success("Regla desactivada.");
          } catch (err) {
            toast.error(errMsg(err));
          }
        })
      }
    >
      Desactivar
    </button>
  );
}
