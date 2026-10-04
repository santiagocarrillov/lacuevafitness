import Link from "next/link";
import { APPOINTMENT_KIND_LABEL, formatAppointmentWhen, type AppointmentKind } from "@/lib/nutrition/appointments";

type Props = {
  appointment: {
    startsAt: Date;
    kind: AppointmentKind;
    sede: "FITNESS_CENTER" | "XTREME";
    staff: { fullName: string };
  };
};

/** "Tu próxima cita con la nutricionista" — shown on Hoy and Nutrición. */
export function NextAppointmentCard({ appointment: a }: Props) {
  const firstName = a.staff.fullName.split(" ")[0];
  return (
    <section className="portal-card" style={{ marginBottom: 14, borderLeft: "3px solid var(--pt-accent)" }}>
      <div className="portal-kicker">Tu próxima cita con nutrición</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4, textTransform: "capitalize" }}>
        {formatAppointmentWhen(a.startsAt)}
      </div>
      <div style={{ fontSize: 13, color: "var(--pt-ink-3)", marginTop: 2 }}>
        {APPOINTMENT_KIND_LABEL[a.kind]} con {firstName} · {a.sede === "XTREME" ? "La Cueva Xtreme" : "La Cueva Fitness Center"}
      </div>
      <Link href="/portal/nutricion/agendar" style={{ display: "inline-block", marginTop: 6, fontSize: 13, color: "var(--pt-accent)", fontWeight: 600 }}>
        Cambiar horario →
      </Link>
    </section>
  );
}

/** No consult booked: invite the socio to pick a slot. */
export function BookAppointmentCard() {
  return (
    <Link href="/portal/nutricion/agendar" className="portal-card" style={{ display: "block", marginBottom: 14, textDecoration: "none", color: "inherit", borderLeft: "3px solid var(--pt-accent)" }}>
      <div className="portal-kicker">Nutrición</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>Agenda tu cita con la nutricionista</div>
      <div style={{ fontSize: 13, color: "var(--pt-ink-3)", marginTop: 2 }}>Elige el día y la hora que te queden → </div>
    </Link>
  );
}
