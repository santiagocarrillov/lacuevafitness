"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ENTITIES, ENTITY_ORDER } from "@/lib/finance/entities";
import { saveEmployee, type EmployeeInput } from "@/lib/actions/payroll";
import type { EmploymentType, Sede } from "@/generated/prisma/enums";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function EmployeeForm({ initial, today }: { initial?: EmployeeInput; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<EmployeeInput>(
    initial ?? {
      sede: "XTREME", firstName: "", lastName: "", employmentType: "DEPENDENCIA", monthlySalaryCents: 48200, weeklyHours: 40,
      startDate: today, iessAffiliated: true, monthlyDecimoTercero: false, monthlyDecimoCuarto: false, monthlyFondosReserva: true,
    },
  );
  const [salary, setSalary] = useState(((initial?.monthlySalaryCents ?? 48200) / 100).toFixed(2));
  const set = <K extends keyof EmployeeInput>(k: K, v: EmployeeInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const dep = f.employmentType === "DEPENDENCIA";
  const cents = Math.round(Number(salary.replace(",", ".")) * 100);
  const partTime = f.weeklyHours < 40;
  const minForHours = Math.round((48200 * f.weeklyHours) / 40);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        if (!Number.isFinite(cents) || cents < 0) throw new Error("Sueldo inválido.");
        const { id } = await saveEmployee({ ...f, monthlySalaryCents: cents });
        toast.success(initial?.id ? "Datos guardados" : "Trabajador agregado");
        router.push(`/dashboard/finanzas/trabajadores/equipo/${id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombres">
          <Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </Field>
        <Field label="Apellidos">
          <Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </Field>
        <Field label="Cédula">
          <Input inputMode="numeric" value={f.idNumber ?? ""} onChange={(e) => set("idNumber", e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Cargo">
          <Input value={f.position ?? ""} onChange={(e) => set("position", e.target.value)} placeholder="Coach, recepción, limpieza…" />
        </Field>
        <Field label="Teléfono">
          <Input value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Correo">
          <Input type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </Field>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Contrato</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Empresa que lo contrata">
            <select className={selectCls} value={f.sede} onChange={(e) => set("sede", e.target.value as Sede)}>
              {ENTITY_ORDER.map((s) => (
                <option key={s} value={s}>{ENTITIES[s].legalName}</option>
              ))}
            </select>
          </Field>
          <Field label="Tipo">
            <select className={selectCls} value={f.employmentType} onChange={(e) => set("employmentType", e.target.value as EmploymentType)}>
              <option value="DEPENDENCIA">Relación de dependencia (rol de pagos)</option>
              <option value="HONORARIOS">Servicios profesionales (factura)</option>
            </select>
          </Field>
          <Field label="Fecha de ingreso">
            <Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
          <Field label={dep ? "Sueldo mensual ($)" : "Honorario mensual de referencia ($)"} hint={dep && partTime ? `Mínimo legal por ${f.weeklyHours} h: $${(minForHours / 100).toFixed(2)}` : dep ? "Mínimo legal 2026: $482,00" : undefined}>
            <Input inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value)} />
          </Field>
          <Field label="Horas por semana" hint={partTime ? "Jornada parcial: décimo cuarto proporcional." : "40 = jornada completa."}>
            <Input inputMode="numeric" value={String(f.weeklyHours)} onChange={(e) => set("weeklyHours", Math.min(40, Number(e.target.value.replace(/\D/g, "")) || 0))} />
          </Field>
          <Field label="Fecha de salida (si ya no trabaja)">
            <Input type="date" value={f.endDate ?? ""} onChange={(e) => set("endDate", e.target.value || null)} />
          </Field>
        </div>
        {dep && cents > 0 && cents < minForHours && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">El sueldo está bajo el mínimo legal para esa jornada.</p>
        )}
        {dep ? (
          <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
            <Check checked={f.iessAffiliated} onChange={(v) => set("iessAffiliated", v)}>Afiliado al IESS</Check>
            <Check checked={f.monthlyFondosReserva} onChange={(v) => set("monthlyFondosReserva", v)}>
              Fondos de reserva cada mes en el rol <span className="text-muted-foreground">(si no, se depositan en el IESS)</span>
            </Check>
            <Check checked={f.monthlyDecimoTercero} onChange={(v) => set("monthlyDecimoTercero", v)}>
              Décimo tercero mensualizado <span className="text-muted-foreground">(si no, se paga hasta el 24 de diciembre)</span>
            </Check>
            <Check checked={f.monthlyDecimoCuarto} onChange={(v) => set("monthlyDecimoCuarto", v)}>
              Décimo cuarto mensualizado <span className="text-muted-foreground">(si no, se paga hasta el 15 de agosto)</span>
            </Check>
          </div>
        ) : (
          <p className="border-t pt-3 text-xs text-muted-foreground">
            No entra en el rol de pagos: sus pagos se registran en Gastos con su factura o liquidación de compra (cuenta Honorarios de coaches).
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Banco">
          <Input value={f.bankName ?? ""} onChange={(e) => set("bankName", e.target.value)} />
        </Field>
        <Field label="Número de cuenta">
          <Input value={f.bankAccount ?? ""} onChange={(e) => set("bankAccount", e.target.value)} />
        </Field>
      </div>
      <Field label="Notas">
        <Input value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={pending || !f.firstName.trim() || !f.lastName.trim()}>
          {pending ? "Guardando…" : initial?.id ? "Guardar cambios" : "Agregar trabajador"}
        </Button>
      </div>
    </form>
  );
}
