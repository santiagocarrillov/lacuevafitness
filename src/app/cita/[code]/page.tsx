import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { loadSlots, sedeName } from "@/lib/nutrition/booking-core";
import { formatAppointmentWhen } from "@/lib/nutrition/appointments";
import { InviteBooking } from "./invite-booking";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agenda tu cita con la nutricionista — La Cueva",
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-md space-y-5">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">La Cueva SRXFIT</p>
          <h1 className="text-2xl font-bold tracking-tight">Cita con la nutricionista</h1>
        </header>
        <div className="rounded-2xl bg-white p-5 shadow-sm">{children}</div>
        <p className="text-center text-xs text-stone-500">¿Dudas? Escríbenos por WhatsApp.</p>
      </div>
    </main>
  );
}

export default async function CitaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const inv = /^[a-z0-9]{6,16}$/.test(code)
    ? await prisma.nutritionBookingInvite.findUnique({ where: { code }, include: { member: { select: { firstName: true, sede: true } } } })
    : null;
  if (!inv) {
    return <Shell><p className="text-center text-sm">Este enlace no existe. Revisa que esté completo o escríbenos por WhatsApp.</p></Shell>;
  }
  if (inv.expiresAt.getTime() < Date.now()) {
    return <Shell><p className="text-center text-sm">Este enlace ya venció. Escríbenos por WhatsApp y te mandamos uno nuevo.</p></Shell>;
  }
  const [slots, current] = await Promise.all([
    loadSlots(prisma, { days: 14 }),
    prisma.nutritionAppointment.findFirst({
      where: { memberId: inv.memberId, status: "SCHEDULED", startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, sede: true },
    }),
  ]);
  const deadline = inv.deadline ? inv.deadline.toISOString().slice(0, 10) : null;
  const deadlineText = inv.deadline
    ? new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(inv.deadline)
    : null;

  return (
    <Shell>
      <div className="space-y-4">
        <div>
          <p className="text-lg font-semibold">¡Hola {inv.member.firstName}! 👋</p>
          <p className="text-sm text-stone-600">
            {inv.reason === "TRIAL"
              ? "Tus dos semanas de evaluación incluyen una cita con la nutricionista: medimos tu composición corporal y revisamos tu alimentación."
              : "Elige el día y la hora para medirte y revisar tu alimentación con la nutricionista. Dura unos 30 minutos."}
            {deadlineText && <> Agéndala <b>antes del {deadlineText}</b>.</>}
          </p>
        </div>
        {current && (
          <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Ya tienes cita el <b>{formatAppointmentWhen(current.startsAt)}</b> en {sedeName(current.sede)}. Si eliges otro horario, la cambiamos.
          </div>
        )}
        <InviteBooking code={code} days={slots} defaultSede={inv.member.sede} deadline={deadline} moving={!!current} />
      </div>
    </Shell>
  );
}
