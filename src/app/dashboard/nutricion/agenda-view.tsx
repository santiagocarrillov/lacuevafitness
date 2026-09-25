"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { setAppointmentStatus } from "@/lib/actions/nutrition-appointments";
import {
  addDays,
  APPOINTMENT_KIND_LABEL,
  APPOINTMENT_STATUS_LABEL,
  ecuadorTimeString,
  type AppointmentKind,
  type AppointmentStatus,
} from "@/lib/nutrition/appointments";
import { AppointmentDialog, type PrefillMember, type StaffOption } from "./appointment-dialog";

type Sede = "FITNESS_CENTER" | "XTREME";

export type AgendaAppointment = {
  id: string;
  startsAt: string; // ISO
  durationMin: number;
  kind: AppointmentKind;
  status: AppointmentStatus;
  sede: Sede;
  notes: string | null;
  staffUserId: string;
  staffName: string;
  memberId: string;
  memberName: string;
  memberPhone: string | null;
};

const SEDE_LABEL: Record<Sede, string> = { FITNESS_CENTER: "Fitness Center", XTREME: "Xtreme" };

const STATUS_CLS: Record<AppointmentStatus, string> = {
  SCHEDULED: "bg-sky-100 text-sky-800",
  ATTENDED: "bg-emerald-100 text-emerald-800",
  NO_SHOW: "bg-red-100 text-red-800",
  CANCELLED: "bg-muted text-muted-foreground line-through",
};

function dayTitle(date: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = date.split("-").map(Number);
  // Noon UTC keeps the calendar day stable in any browser timezone.
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("es-EC", { timeZone: "UTC", ...opts });
}

function ecuadorDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
}

export function AgendaView(props: {
  date: string;
  today: string;
  view: "dia" | "semana";
  from: string;
  sede: Sede | null;
  sedeLocked: boolean;
  appointments: AgendaAppointment[];
  staff: StaffOption[];
  defaultStaffId: string;
  prefillMember: PrefillMember | null;
}) {
  const { date, today, view, from, sede, sedeLocked, appointments, staff, defaultStaffId } = props;
  const router = useRouter();
  const [creating, setCreating] = useState(props.prefillMember !== null);
  const [editing, setEditing] = useState<AgendaAppointment | null>(null);

  function go(patch: Record<string, string | null>) {
    const sp = new URLSearchParams();
    if (date !== today) sp.set("fecha", date);
    if (view === "semana") sp.set("vista", view);
    if (sede && !sedeLocked) sp.set("sede", sede);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`/dashboard/nutricion?${sp.toString()}`);
  }

  const step = view === "semana" ? 7 : 1;
  const counts = {
    total: appointments.filter((a) => a.status !== "CANCELLED").length,
    attended: appointments.filter((a) => a.status === "ATTENDED").length,
    noShow: appointments.filter((a) => a.status === "NO_SHOW").length,
    pending: appointments.filter((a) => a.status === "SCHEDULED").length,
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => go({ fecha: addDays(date, -step) })}>
            ←
          </Button>
          <Button
            variant={date === today ? "secondary" : "outline"}
            size="sm"
            onClick={() => go({ fecha: null })}
          >
            Hoy
          </Button>
          <Button variant="outline" size="sm" onClick={() => go({ fecha: addDays(date, step) })}>
            →
          </Button>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && go({ fecha: e.target.value })}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        />
        <div className="flex rounded-md border border-input overflow-hidden">
          {(["dia", "semana"] as const).map((v) => (
            <button
              key={v}
              onClick={() => go({ vista: v === "dia" ? null : v })}
              className={`px-3 h-8 text-sm ${view === v ? "bg-foreground text-background" : "bg-background"}`}
            >
              {v === "dia" ? "Día" : "Semana"}
            </button>
          ))}
        </div>
        {!sedeLocked && (
          <select
            value={sede ?? ""}
            onChange={(e) => go({ sede: e.target.value || null })}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Ambas sedes</option>
            <option value="FITNESS_CENTER">Fitness Center</option>
            <option value="XTREME">Xtreme</option>
          </select>
        )}
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          + Nueva cita
        </Button>
      </div>

      <div>
        <h2 className="text-lg font-semibold capitalize">
          {view === "dia"
            ? dayTitle(date, { weekday: "long", day: "numeric", month: "long" })
            : `Semana del ${dayTitle(from, { day: "numeric", month: "long" })}`}
        </h2>
        <p className="text-sm text-muted-foreground">
          {counts.total} {counts.total === 1 ? "cita" : "citas"} · {counts.attended} atendidos ·{" "}
          {counts.noShow} no vinieron · {counts.pending} pendientes
        </p>
      </div>

      {view === "dia" ? (
        appointments.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No hay citas este día.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {appointments.map((a) => (
              <AppointmentCard key={a.id} a={a} showSede={!sede} onEdit={() => setEditing(a)} />
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => {
            const dayAppts = appointments.filter((a) => ecuadorDay(a.startsAt) === d);
            return (
              <div
                key={d}
                className={`rounded-lg border p-2 space-y-2 min-h-24 ${
                  d === today ? "border-foreground/40 bg-muted/40" : "border-border"
                }`}
              >
                <button
                  onClick={() => go({ fecha: d, vista: null })}
                  className="text-xs font-medium uppercase text-muted-foreground hover:text-foreground capitalize"
                >
                  {dayTitle(d, { weekday: "short", day: "numeric" })}
                </button>
                {dayAppts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setEditing(a)}
                    className={`block w-full text-left rounded px-2 py-1 text-xs ${STATUS_CLS[a.status]}`}
                  >
                    <span className="font-semibold">{ecuadorTimeString(new Date(a.startsAt))}</span>{" "}
                    {a.memberName}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <AppointmentDialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setCreating(false);
              setEditing(null);
            }
          }}
          staff={staff}
          defaultStaffId={defaultStaffId}
          defaultDate={date}
          prefillMember={creating ? props.prefillMember : null}
          appointment={editing}
        />
      )}
    </div>
  );
}

function AppointmentCard({
  a,
  showSede,
  onEdit,
}: {
  a: AgendaAppointment;
  showSede: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const start = new Date(a.startsAt);
  const end = new Date(start.getTime() + a.durationMin * 60_000);

  function mark(status: AppointmentStatus) {
    startTransition(async () => {
      try {
        await setAppointmentStatus(a.id, status);
        toast.success(`${a.memberName}: ${APPOINTMENT_STATUS_LABEL[status].toLowerCase()}.`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo actualizar.");
      }
    });
  }

  return (
    <Card className={a.status === "CANCELLED" ? "opacity-60" : undefined}>
      <CardContent className="py-3 flex flex-col md:flex-row md:items-center gap-3">
        <div className="w-28 shrink-0">
          <p className="text-lg font-semibold tabular-nums">{ecuadorTimeString(start)}</p>
          <p className="text-xs text-muted-foreground">hasta {ecuadorTimeString(end)}</p>
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/dashboard/socios/${a.memberId}`} className="font-medium hover:underline">
              {a.memberName}
            </Link>
            <Badge variant="outline">{APPOINTMENT_KIND_LABEL[a.kind]}</Badge>
            <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLS[a.status]}`}>
              {APPOINTMENT_STATUS_LABEL[a.status]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {a.staffName}
            {showSede ? ` · ${SEDE_LABEL[a.sede]}` : ""}
            {a.memberPhone ? ` · ${a.memberPhone}` : ""}
          </p>
          {a.notes && <p className="text-sm whitespace-pre-wrap">{a.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-1 md:justify-end">
          {a.status === "SCHEDULED" ? (
            <>
              <Button size="sm" disabled={isPending} onClick={() => mark("ATTENDED")}>
                Atendido
              </Button>
              <Button size="sm" variant="outline" disabled={isPending} onClick={() => mark("NO_SHOW")}>
                No vino
              </Button>
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => mark("CANCELLED")}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => mark("SCHEDULED")}>
              Deshacer
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Editar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
