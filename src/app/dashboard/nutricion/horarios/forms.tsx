"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addTimeOff, removeAvailabilityWindow, removeTimeOff, saveAvailabilityWindow } from "@/lib/actions/nutrition-booking";
import { WEEKDAY_LABEL } from "@/lib/nutrition/slots";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const err = (e: unknown) => (e instanceof Error ? e.message : "No se pudo guardar.");

export function AddWindowForm({ staff }: { staff: { id: string; name: string; role: string }[] }) {
  const [pending, start] = useTransition();
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          try {
            await saveAvailabilityWindow({
              staffUserId: String(fd.get("staff") || ""),
              sede: String(fd.get("sede")),
              weekdays: days,
              start: String(fd.get("start")),
              end: String(fd.get("end")),
              slotMinutes: Number(fd.get("slot")),
            });
            toast.success("Horario agregado.");
          } catch (e2) {
            toast.error(err(e2));
          }
        });
      }}
    >
      <p className="text-sm font-medium">Agregar bloque</p>
      <div className="flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${days.includes(d) ? "border-[#2f855a] bg-[#2f855a] text-white" : "bg-white"}`}
          >
            {WEEKDAY_LABEL[d].slice(0, 3)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Sede</Label>
          <select name="sede" className={selectCls}>
            <option value="FITNESS_CENTER">Fitness Center</option>
            <option value="XTREME">Xtreme</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Desde</Label>
          <Input name="start" type="time" defaultValue="16:00" required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hasta</Label>
          <Input name="end" type="time" defaultValue="19:00" required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cada cita</Label>
          <select name="slot" className={selectCls} defaultValue="30">
            {[20, 30, 40, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
      </div>
      {staff.length > 1 && (
        <div className="space-y-1 sm:w-1/2">
          <Label className="text-xs">Quién atiende</Label>
          <select name="staff" className={selectCls} defaultValue={staff.find((s) => s.role === "NUTRITIONIST")?.id}>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <Button type="submit" size="sm" disabled={pending || days.length === 0}>{pending ? "Guardando…" : "Agregar"}</Button>
    </form>
  );
}

export function AddTimeOffForm() {
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form
      className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        start(async () => {
          try {
            const r = await addTimeOff({
              from: String(fd.get("from")),
              to: String(fd.get("to") || fd.get("from")),
              startTime: String(fd.get("startTime") || "") || undefined,
              endTime: String(fd.get("endTime") || "") || undefined,
              reason: String(fd.get("reason") || ""),
            });
            toast.success(r.clashes ? `Guardado. Ojo: hay ${r.clashes} cita(s) agendada(s) en ese tiempo; reagéndalas.` : "Guardado.");
            form.reset();
          } catch (e2) {
            toast.error(err(e2));
          }
        });
      }}
    >
      <div className="space-y-1">
        <Label className="text-xs">Desde</Label>
        <Input name="from" type="date" defaultValue={today} required />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Hasta</Label>
        <Input name="to" type="date" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Horas (opcional)</Label>
        <div className="flex gap-1">
          <Input name="startTime" type="time" />
          <Input name="endTime" type="time" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Motivo</Label>
        <Input name="reason" placeholder="Vacaciones" />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>Bloquear</Button>
    </form>
  );
}

function RemoveButton({ run, label }: { run: () => Promise<void>; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-red-700 hover:underline"
      onClick={() =>
        start(async () => {
          try {
            await run();
            toast.success("Quitado.");
          } catch (e) {
            toast.error(err(e));
          }
        })
      }
    >
      {label}
    </button>
  );
}

export const RemoveWindowButton = ({ id }: { id: string }) => <RemoveButton run={() => removeAvailabilityWindow(id)} label="Quitar" />;
export const RemoveTimeOffButton = ({ id }: { id: string }) => <RemoveButton run={() => removeTimeOff(id)} label="Quitar" />;
