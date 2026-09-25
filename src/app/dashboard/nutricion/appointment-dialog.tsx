"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
} from "@/components/ui/dialog";
import {
  createAppointment,
  searchMembersForNutrition,
  setAppointmentStatus,
  updateAppointment,
} from "@/lib/actions/nutrition-appointments";
import {
  APPOINTMENT_KIND_LABEL,
  APPOINTMENT_STATUS_LABEL,
  ecuadorTimeString,
  type AppointmentKind,
  type AppointmentStatus,
} from "@/lib/nutrition/appointments";
import type { AgendaAppointment } from "./agenda-view";

type Sede = "FITNESS_CENTER" | "XTREME";

export type StaffOption = { id: string; fullName: string; role: string };
export type PrefillMember = {
  id: string;
  firstName: string;
  lastName: string;
  sede: Sede;
  status: string;
};

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function MemberSearch({
  value,
  onChange,
}: {
  value: PrefillMember | null;
  onChange: (m: PrefillMember | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PrefillMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchMembersForNutrition(q);
        if (!cancelled) setResults(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm">
        <span className="font-medium">
          {value.firstName} {value.lastName}
        </span>
        <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => onChange(null)}>
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        autoFocus
        placeholder="Buscar socio por nombre…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {loading && <p className="text-xs text-muted-foreground">Buscando…</p>}
      {results.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-input divide-y">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onChange(m)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
              >
                {m.firstName} {m.lastName}
                <span className="ml-2 text-xs text-muted-foreground">
                  {m.sede === "XTREME" ? "Xtreme" : "Fitness Center"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && q.trim().length >= 2 && results.length === 0 && (
        <p className="text-xs text-muted-foreground">Sin resultados.</p>
      )}
    </div>
  );
}

export function AppointmentDialog({
  open,
  onOpenChange,
  staff,
  defaultStaffId,
  defaultDate,
  prefillMember,
  appointment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffOption[];
  defaultStaffId: string;
  defaultDate: string;
  prefillMember: PrefillMember | null;
  appointment: AgendaAppointment | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const editing = appointment !== null;

  const [member, setMember] = useState<PrefillMember | null>(prefillMember);
  const [form, setForm] = useState(() =>
    appointment
      ? {
          date: new Date(appointment.startsAt).toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" }),
          time: ecuadorTimeString(new Date(appointment.startsAt)),
          durationMin: String(appointment.durationMin),
          kind: appointment.kind,
          staffUserId: appointment.staffUserId,
          sede: appointment.sede as string,
          notes: appointment.notes ?? "",
        }
      : {
          date: defaultDate,
          time: "09:00",
          durationMin: "30",
          kind: "FOLLOW_UP" as AppointmentKind,
          staffUserId: defaultStaffId,
          sede: "",
          notes: "",
        },
  );

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing && !member) {
      toast.error("Elige un socio.");
      return;
    }
    const input = {
      memberId: appointment?.memberId ?? member!.id,
      date: form.date,
      time: form.time,
      durationMin: Number(form.durationMin),
      kind: form.kind,
      staffUserId: form.staffUserId,
      sede: (form.sede || null) as Sede | null,
      notes: form.notes,
    };
    startTransition(async () => {
      try {
        if (appointment) await updateAppointment(appointment.id, input);
        else await createAppointment(input);
        toast.success(editing ? "Cita actualizada." : "Cita agendada. El socio recibe un aviso en su app.");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  function mark(status: AppointmentStatus) {
    if (!appointment) return;
    startTransition(async () => {
      try {
        await setAppointmentStatus(appointment.id, status);
        toast.success(APPOINTMENT_STATUS_LABEL[status]);
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo actualizar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? appointment.memberName : "Nueva cita"}</DialogTitle>
          <DialogDescription>
            {editing
              ? `${APPOINTMENT_STATUS_LABEL[appointment.status]} · las notas solo las ve el staff.`
              : "El socio la ve en su app y recibe un recordatorio el día anterior."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          {!editing && (
            <div className="space-y-1">
              <Label>Socio</Label>
              <MemberSearch value={member} onChange={setMember} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="appt-date">Fecha</Label>
              <Input id="appt-date" type="date" required value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="appt-time">Hora</Label>
              <Input
                id="appt-time"
                type="time"
                required
                step={300}
                value={form.time}
                onChange={(e) => set("time", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="appt-kind">Tipo</Label>
              <select
                id="appt-kind"
                className={selectCls}
                value={form.kind}
                onChange={(e) => set("kind", e.target.value as AppointmentKind)}
              >
                {(Object.keys(APPOINTMENT_KIND_LABEL) as AppointmentKind[]).map((k) => (
                  <option key={k} value={k}>
                    {APPOINTMENT_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="appt-dur">Duración</Label>
              <select
                id="appt-dur"
                className={selectCls}
                value={form.durationMin}
                onChange={(e) => set("durationMin", e.target.value)}
              >
                {[15, 20, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="appt-staff">Con</Label>
              <select
                id="appt-staff"
                className={selectCls}
                value={form.staffUserId}
                onChange={(e) => set("staffUserId", e.target.value)}
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="appt-sede">Sede</Label>
              <select
                id="appt-sede"
                className={selectCls}
                value={form.sede}
                onChange={(e) => set("sede", e.target.value)}
              >
                {!editing && <option value="">La del socio</option>}
                <option value="FITNESS_CENTER">Fitness Center</option>
                <option value="XTREME">Xtreme</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="appt-notes">Notas (privadas)</Label>
            <textarea
              id="appt-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Motivo, qué revisar, acuerdos…"
            />
          </div>

          <div className="flex flex-wrap justify-between gap-2 pt-1">
            {editing && appointment.status === "SCHEDULED" ? (
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="secondary" disabled={isPending} onClick={() => mark("ATTENDED")}>
                  Atendido
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => mark("NO_SHOW")}>
                  No vino
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => mark("CANCELLED")}>
                  Cancelar cita
                </Button>
              </div>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando…" : editing ? "Guardar" : "Agendar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
