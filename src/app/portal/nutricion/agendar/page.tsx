import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { PortalShell } from "@/components/portal/portal-shell";
import { getMyBookingOptions } from "@/lib/actions/nutrition-booking";
import { formatAppointmentWhen } from "@/lib/nutrition/appointments";
import { PortalBooking } from "./portal-booking";

export const dynamic = "force-dynamic";

export default async function AgendarNutricionPage() {
  const { member } = await requireMember();
  const { slots, next, homeSede } = await getMyBookingOptions();
  return (
    <PortalShell avatarInitial={member.firstName.charAt(0).toUpperCase()}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/portal/nutricion" style={{ fontSize: 13, color: "var(--pt-ink-3)" }}>← Nutrición</Link>
        <div className="portal-kicker" style={{ marginTop: 8 }}>Nutrición</div>
        <h2 className="portal-title">{next ? "Cambiar tu cita" : "Agenda tu cita"}</h2>
        <p style={{ fontSize: 14, color: "var(--pt-ink-3)", marginTop: 4 }}>
          {next
            ? `Tienes cita el ${formatAppointmentWhen(next.startsAt)}. Si eliges otro horario, la movemos.`
            : "Te medimos y revisamos tu alimentación con la nutricionista. Dura unos 30 minutos."}
        </p>
      </div>
      <section className="portal-card">
        <PortalBooking days={slots} defaultSede={homeSede} moving={!!next} />
      </section>
    </PortalShell>
  );
}
