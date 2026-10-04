import { redirect } from "next/navigation";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listNutritionStaff } from "@/lib/actions/nutrition-appointments";
import { ecuadorDateString } from "@/lib/timezone";
import { safeBack } from "@/lib/safe-back";
import { NutritionFormPage } from "../../nutrition-form-page";
import { AppointmentForm } from "../../appointment-form";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export default async function NuevaCitaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; hora?: string; socio?: string; volver?: string }>;
}) {
  const user = await requireAuth();
  if (!can.scheduleNutrition(user)) redirect("/dashboard");
  const params = await searchParams;
  const scope = getSedeScope(user);

  const date = params.fecha && DATE_RE.test(params.fecha) ? params.fecha : ecuadorDateString();
  const time = params.hora && TIME_RE.test(params.hora) ? params.hora : "09:00";

  const [staff, prefillMember] = await Promise.all([
    listNutritionStaff(),
    params.socio
      ? prisma.member.findFirst({
          where: { id: params.socio, ...(scope ? { OR: [{ sede: scope }, { secondarySede: scope }] } : {}) },
          select: { id: true, firstName: true, lastName: true, sede: true, status: true },
        })
      : Promise.resolve(null),
  ]);

  const back = safeBack(params.volver, params.fecha ? `/dashboard/nutricion/agenda?fecha=${date}` : "/dashboard/nutricion");

  return (
    <NutritionFormPage
      title="Nueva cita"
      description="El socio la ve en su app y recibe un recordatorio el día anterior."
    >
      <AppointmentForm
        staff={staff}
        defaultStaffId={
          user.role === "NUTRITIONIST" ? user.id : staff.find((s) => s.role === "NUTRITIONIST")?.id ?? user.id
        }
        defaultDate={date}
        defaultTime={time}
        prefillMember={prefillMember}
        appointment={null}
        backHref={back}
      />
    </NutritionFormPage>
  );
}
