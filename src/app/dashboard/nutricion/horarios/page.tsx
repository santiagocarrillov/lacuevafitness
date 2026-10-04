import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAvailability } from "@/lib/actions/nutrition-booking";
import { loadSlots } from "@/lib/nutrition/booking-core";
import { WEEKDAY_LABEL, minuteToTime } from "@/lib/nutrition/slots";
import { AddTimeOffForm, AddWindowForm, RemoveTimeOffButton, RemoveWindowButton } from "./forms";

export const dynamic = "force-dynamic";

const SEDE: Record<string, string> = { FITNESS_CENTER: "Fitness Center", XTREME: "Xtreme" };
const when = (d: Date) => d.toLocaleString("es-EC", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Guayaquil" });

export default async function HorariosPage() {
  const user = await requireAuth();
  const canEdit = can.manageNutrition(user);
  const [{ windows, timeOff, staff }, slots] = await Promise.all([getAvailability(), loadSlots(prisma, { days: 14 })]);
  const open = slots.reduce((n, d) => n + d.slots.length, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <div className="space-y-5 lg:col-span-7">
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#2f855a]">Horario semanal</h2>
          <p className="mb-4 text-sm text-muted-foreground">Los socios eligen un espacio libre de estos bloques, en la app o con el enlace que les mandas por WhatsApp. Una cita tomada ya no aparece.</p>
          {windows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Todavía no hay horarios. Agrega el primero abajo.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {[1, 2, 3, 4, 5, 6, 7].flatMap((d) =>
                windows
                  .filter((w) => w.weekday === d)
                  .map((w) => (
                    <li key={w.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="w-24 font-medium">{WEEKDAY_LABEL[d]}</span>
                      <span className="tabular-nums">{minuteToTime(w.startMinute)}–{minuteToTime(w.endMinute)}</span>
                      <span className="text-muted-foreground">· {SEDE[w.sede]} · citas de {w.slotMinutes} min</span>
                      {staff.length > 1 && <span className="text-xs text-muted-foreground">· {w.staff.fullName}</span>}
                      <span className="ml-auto">{canEdit && <RemoveWindowButton id={w.id} />}</span>
                    </li>
                  )),
              )}
            </ul>
          )}
          {canEdit && (
            <div className="mt-5 border-t pt-4">
              <AddWindowForm staff={staff.map((s) => ({ id: s.id, name: s.fullName, role: s.role }))} />
            </div>
          )}
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#2f855a]">Días u horas sin atención</h2>
          <p className="mb-4 text-sm text-muted-foreground">Vacaciones, feriados o un compromiso: esos espacios dejan de ofrecerse. Las citas ya agendadas no se mueven solas.</p>
          {timeOff.length > 0 && (
            <ul className="mb-4 divide-y rounded-lg border">
              {timeOff.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span>{when(t.startsAt)} → {when(t.endsAt)}</span>
                  {t.reason && <span className="text-muted-foreground">· {t.reason}</span>}
                  <span className="ml-auto">{canEdit && <RemoveTimeOffButton id={t.id} />}</span>
                </li>
              ))}
            </ul>
          )}
          {canEdit && <AddTimeOffForm />}
        </section>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-5 lg:col-span-5">
        <h2 className="text-[15px] font-semibold text-[#2f855a]">Lo que ven los socios</h2>
        <p className="mb-3 text-sm text-muted-foreground">{open} horarios libres en las próximas dos semanas.</p>
        <ul className="space-y-3 text-sm">
          {slots.slice(0, 10).map((d) => (
            <li key={d.date}>
              <p className="font-medium capitalize">{new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d.date}T12:00:00Z`))}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {d.slots.map((s) => (
                  <span key={s.startsAt + s.staffUserId} className="rounded-md bg-stone-100 px-1.5 py-0.5 text-xs tabular-nums">
                    {s.time} <span className="text-muted-foreground">{s.sede === "XTREME" ? "X" : "F"}</span>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
