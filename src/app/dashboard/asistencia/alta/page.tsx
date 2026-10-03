import { notFound, redirect } from "next/navigation";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAttendanceWindowOpen } from "@/lib/timezone";
import { FormPage } from "@/app/dashboard/form-page";
import { safeBack } from "@/lib/safe-back";
import { TrialCheckinForm } from "../trial-checkin-form";

export const dynamic = "force-dynamic";

const SEDE_LABEL: Record<string, string> = { FITNESS_CENTER: "Fitness Center", XTREME: "Xtreme" };

export default async function AltaEvaluacionPage({
  searchParams,
}: {
  searchParams: Promise<{ horario?: string; lead?: string; volver?: string }>;
}) {
  const user = await requireAuth();
  // Only the front desk registers attendance (coaches confirm the count).
  if (!can.recordAttendance(user)) redirect("/dashboard/asistencia");
  const { horario, lead: leadId, volver } = await searchParams;
  if (!horario || !leadId) notFound();
  const scope = getSedeScope(user);

  const schedule = await prisma.classSchedule.findFirst({
    where: { id: horario, active: true, ...(scope ? { sede: scope } : {}) },
    select: { id: true, name: true, sede: true },
  });
  if (!schedule) notFound();
  // Same leads the attendance panel lists: booked at this class's sede.
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, sede: schedule.sede },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });
  if (!lead) notFound();

  const back = safeBack(volver, `/dashboard/asistencia?horario=${schedule.id}`);

  return (
    <FormPage
      title="Registrar evaluación y dar de alta"
      description={
        <>
          {schedule.name} · {SEDE_LABEL[schedule.sede] ?? schedule.sede}. Confirma el nombre real con la
          persona antes de crear al socio. Se guarda así en reportes, portal y facturación.
        </>
      }
    >
      <TrialCheckinForm
        scheduleId={schedule.id}
        lead={{
          leadId: lead.id,
          name: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Sin nombre",
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
        }}
        windowOpen={isAttendanceWindowOpen()}
        backHref={back}
      />
    </FormPage>
  );
}
