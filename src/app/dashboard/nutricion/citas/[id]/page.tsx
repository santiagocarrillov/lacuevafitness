import { notFound, redirect } from "next/navigation";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listNutritionStaff } from "@/lib/actions/nutrition-appointments";
import { APPOINTMENT_STATUS_LABEL } from "@/lib/nutrition/appointments";
import { safeBack } from "@/lib/safe-back";
import { NutritionFormPage } from "../../nutrition-form-page";
import { AppointmentForm } from "../../appointment-form";
import type { AgendaAppointment } from "../../agenda-view";

export const dynamic = "force-dynamic";

export default async function EditarCitaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  const user = await requireAuth();
  if (!can.scheduleNutrition(user)) redirect("/dashboard");
  const [{ id }, { volver }] = await Promise.all([params, searchParams]);
  const scope = getSedeScope(user);

  const [a, staff] = await Promise.all([
    prisma.nutritionAppointment.findUnique({
      where: { id },
      select: {
        id: true,
        startsAt: true,
        durationMin: true,
        kind: true,
        status: true,
        sede: true,
        notes: true,
        staffUserId: true,
        staff: { select: { fullName: true } },
        member: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    }),
    listNutritionStaff(),
  ]);
  // Same sede scoping as the agenda: an ADMIN only sees their sede's appointments.
  if (!a || (scope && a.sede !== scope)) notFound();

  const appointment: AgendaAppointment = {
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
  };
  const day = a.startsAt.toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
  const back = safeBack(volver, `/dashboard/nutricion?fecha=${day}`);

  return (
    <NutritionFormPage
      title={appointment.memberName}
      description={`${APPOINTMENT_STATUS_LABEL[a.status]} · las notas solo las ve el staff.`}
    >
      <AppointmentForm
        staff={staff}
        defaultStaffId={a.staffUserId}
        defaultDate={day}
        defaultTime="09:00"
        prefillMember={null}
        appointment={appointment}
        backHref={back}
      />
    </NutritionFormPage>
  );
}
