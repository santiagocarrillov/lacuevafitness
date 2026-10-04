"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { approvePayrollRun, markPayrollPaid, reopenPayrollRun, voidPayrollRun } from "@/lib/actions/payroll";
import { PAY_METHOD_LABELS } from "@/lib/finance/entities";
import type { ExpensePayMethod, PayrollStatus } from "@/generated/prisma/enums";

export function RunActions({ id, status, today }: { id: string; status: PayrollStatus; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<ExpensePayMethod>("BANK_TRANSFER");
  const run = (fn: () => Promise<void>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo.");
      }
    });

  if (status === "DRAFT") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            const reason = window.prompt("¿Por qué se anula este rol?");
            if (reason?.trim()) run(() => voidPayrollRun(id, reason), "Rol anulado");
          }}
        >
          Anular
        </Button>
        <Button disabled={pending} onClick={() => run(() => approvePayrollRun(id), "Rol aprobado: ya está en la contabilidad")}>
          Aprobar rol
        </Button>
      </div>
    );
  }
  if (status === "APPROVED") {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <Button variant="outline" disabled={pending} onClick={() => run(() => reopenPayrollRun(id), "Rol reabierto")}>Reabrir</Button>
        <div className="flex items-end gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2">
          <Input type="date" className="h-8 w-36 bg-white" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          <select className="h-8 rounded-md border border-input bg-white px-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value as ExpensePayMethod)}>
            {(["BANK_TRANSFER", "CASH", "OTHER"] as ExpensePayMethod[]).map((m) => (
              <option key={m} value={m}>{PAY_METHOD_LABELS[m]}</option>
            ))}
          </select>
          <Button size="sm" disabled={pending} onClick={() => run(() => markPayrollPaid(id, date, method), "Pago de sueldos registrado")}>
            Registrar pago de sueldos
          </Button>
        </div>
      </div>
    );
  }
  return null;
}
