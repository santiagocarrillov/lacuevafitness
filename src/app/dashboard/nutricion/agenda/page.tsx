import { redirect } from "next/navigation";
import { requireAuth, getSedeScope } from "@/lib/auth";
import { getAgenda } from "@/lib/actions/nutrition-appointments";
import { addDays, mondayOf } from "@/lib/nutrition/appointments";
import { ecuadorDateString } from "@/lib/timezone";
import { AgendaView, type AgendaAppointment } from "../agenda-view";
import type { Sede } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function NutricionAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; vista?: string; sede?: string; nuevo?: string }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;

  // Old "?nuevo=<memberId>" links (socio file) now open the booking screen.
  if (params.nuevo) {
    const sp = new URLSearchParams({ socio: params.nuevo, volver: `/dashboard/socios/${params.nuevo}` });
    redirect(`/dashboard/nutricion/citas/nueva?${sp.toString()}`);
  }

  const today = ecuadorDateString();
  const date = params.fecha && DATE_RE.test(params.fecha) ? params.fecha : today;
  const view = params.vista === "semana" ? "semana" : "dia";
  const lockedSede = getSedeScope(user);
  const sede: Sede | null =
    lockedSede ?? (params.sede === "FITNESS_CENTER" || params.sede === "XTREME" ? params.sede : null);

  const from = view === "semana" ? mondayOf(date) : date;
  const to = view === "semana" ? addDays(from, 6) : date;

  const appointments = await getAgenda(from, to, sede);

  const rows: AgendaAppointment[] = appointments.map((a) => ({
    id: a.id,
    startsAt: a.startsAt.toISOString(),
    durationMin: a.durationMin,
    kind: a.kind,
    status: a.status,
    sede: a.sede,
    notes: a.notes,
    staffUserId: a.staffUserId,
    staffName: a.staff.fullName,
    memberId: a.member.id,
    memberName: `${a.member.firstName} ${a.member.lastName}`.trim(),
    memberPhone: a.member.phone,
  }));

  return (
    <AgendaView
      date={date}
      today={today}
      view={view}
      from={from}
      sede={sede}
      sedeLocked={lockedSede !== null}
      appointments={rows}
    />
  );
}
