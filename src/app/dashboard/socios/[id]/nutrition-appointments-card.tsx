import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  APPOINTMENT_KIND_LABEL,
  APPOINTMENT_STATUS_LABEL,
  formatAppointmentWhen,
  type AppointmentKind,
  type AppointmentStatus,
} from "@/lib/nutrition/appointments";

type Appt = {
  id: string;
  startsAt: Date;
  kind: AppointmentKind;
  status: AppointmentStatus;
  notes: string | null;
  staff: { fullName: string };
};

const STATUS_CLS: Record<AppointmentStatus, string> = {
  SCHEDULED: "bg-sky-100 text-sky-800",
  ATTENDED: "bg-emerald-100 text-emerald-800",
  NO_SHOW: "bg-red-100 text-red-800",
  CANCELLED: "bg-muted text-muted-foreground",
};

export function NutritionAppointmentsCard({
  memberId,
  appointments,
}: {
  memberId: string;
  appointments: Appt[];
}) {
  const attended = appointments.filter((a) => a.status === "ATTENDED").length;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Citas con nutrición</CardTitle>
          <CardDescription>
            {appointments.length === 0
              ? "Todavía no ha tenido consulta."
              : `${attended} ${attended === 1 ? "consulta atendida" : "consultas atendidas"}`}
          </CardDescription>
        </div>
        <Link
          href={`/dashboard/nutricion?nuevo=${memberId}`}
          className="text-sm font-medium hover:underline whitespace-nowrap"
        >
          + Agendar
        </Link>
      </CardHeader>
      {appointments.length > 0 && (
        <CardContent className="space-y-2">
          {appointments.map((a) => (
            <div key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm border-b last:border-0 pb-2">
              <span className="font-medium capitalize">{formatAppointmentWhen(a.startsAt)}</span>
              <span className="text-muted-foreground">{APPOINTMENT_KIND_LABEL[a.kind]}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLS[a.status]}`}>
                {APPOINTMENT_STATUS_LABEL[a.status]}
              </span>
              <span className="text-xs text-muted-foreground">{a.staff.fullName}</span>
              {a.notes && <p className="w-full text-muted-foreground whitespace-pre-wrap">{a.notes}</p>}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
