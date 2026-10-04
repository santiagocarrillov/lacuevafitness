"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarCheck, MapPin } from "lucide-react";
import type { Slot, SlotDay, SedeKey } from "@/lib/nutrition/slots";

const SEDE_LABEL: Record<SedeKey, string> = { FITNESS_CENTER: "Fitness Center", XTREME: "Xtreme" };

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("es-EC", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const longDay = (date: string) =>
  new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export type BookedInfo = { startsAt: string; sede: SedeKey; moved: boolean };

/**
 * Pick a sede, a day and a time, then confirm. `book` does the server call and
 * throws a readable error when the slot was just taken.
 */
export function SlotPicker({
  days,
  defaultSede,
  deadline,
  book,
  confirmLabel = "Confirmar cita",
}: {
  days: SlotDay[];
  defaultSede?: SedeKey | null;
  deadline?: string | null;
  book: (slot: Slot) => Promise<BookedInfo>;
  confirmLabel?: string;
}) {
  const sedes = useMemo(() => [...new Set(days.flatMap((d) => d.slots.map((s) => s.sede)))] as SedeKey[], [days]);
  const [sede, setSede] = useState<SedeKey | null>(defaultSede && sedes.includes(defaultSede) ? defaultSede : sedes[0] ?? null);
  const visible = days.map((d) => ({ ...d, slots: d.slots.filter((s) => !sede || s.sede === sede) })).filter((d) => d.slots.length);
  const [date, setDate] = useState<string | null>(null);
  const day = visible.find((d) => d.date === date) ?? visible[0] ?? null;
  const [picked, setPicked] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<BookedInfo | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    const d = new Date(done.startsAt);
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CalendarCheck className="mx-auto mb-2 size-10 text-emerald-700" />
        <p className="text-lg font-semibold text-emerald-900">{done.moved ? "¡Cita cambiada!" : "¡Cita agendada!"}</p>
        <p className="mt-1 text-emerald-900">
          {new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Guayaquil" }).format(d)}
        </p>
        <p className="text-sm text-emerald-800">La Cueva {SEDE_LABEL[done.sede]}</p>
        <p className="mt-3 text-xs text-emerald-800">Te recordamos el día anterior. Llega 5 minutos antes, con ropa cómoda.</p>
      </div>
    );
  }

  if (!visible.length && !sedes.length) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hay horarios libres en las próximas dos semanas. Escríbenos por WhatsApp y te buscamos un espacio.</p>;
  }

  return (
    <div className="space-y-5">
      {sedes.length > 1 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Sede</p>
          <div className="grid grid-cols-2 gap-2">
            {sedes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setSede(s); setDate(null); setPicked(null); }}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${sede === s ? "border-stone-900 bg-stone-900 text-white" : "bg-white hover:border-stone-400"}`}
              >
                <MapPin className="size-4" /> {SEDE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Día</p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {visible.map((d) => {
            const late = deadline && d.date > deadline;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => { setDate(d.date); setPicked(null); }}
                className={`shrink-0 rounded-xl border px-3 py-2 text-center text-sm capitalize transition ${day?.date === d.date ? "border-stone-900 bg-stone-900 text-white" : late ? "bg-stone-50 text-muted-foreground" : "bg-white hover:border-stone-400"}`}
              >
                {dayLabel(d.date)}
                <span className="block text-[11px] opacity-70">{d.slots.length} libres</span>
              </button>
            );
          })}
        </div>
        {deadline && day && day.date > deadline && <p className="mt-1 text-xs text-amber-700">Ojo: es después de tu fecha límite ({longDay(deadline)}).</p>}
      </div>

      {day && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground first-letter:uppercase">Hora · {longDay(day.date)}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {day.slots.map((s) => (
              <button
                key={`${s.staffUserId}-${s.startsAt}`}
                type="button"
                onClick={() => setPicked(s)}
                className={`rounded-lg border px-2 py-2 text-sm font-medium tabular-nums transition ${picked?.startsAt === s.startsAt ? "border-emerald-700 bg-emerald-700 text-white" : "bg-white hover:border-stone-400"}`}
              >
                {s.time}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <button
        type="button"
        disabled={!picked || pending}
        onClick={() =>
          picked &&
          start(async () => {
            setError(null);
            try {
              setDone(await book(picked));
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo agendar. Intenta otro horario.");
              setPicked(null);
            }
          })
        }
        className="w-full rounded-xl bg-emerald-700 py-3 text-base font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-40"
      >
        {pending ? "Agendando…" : picked ? `${confirmLabel} · ${picked.time}` : "Elige un horario"}
      </button>
    </div>
  );
}
