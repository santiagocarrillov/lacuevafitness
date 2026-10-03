import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getWeekSessions, TOTAL_WEEKS } from "@/lib/srxfit-calendar";
import { activacionToMd, fuerzaToMd, acondicionamientoToMd, regulacionToMd } from "@/lib/srxfit-md";
import { getSessionOverride } from "@/lib/actions/srxfit-overrides";
import { FormPage } from "@/app/dashboard/form-page";
import { safeBack } from "@/lib/safe-back";
import { SessionForm } from "../session-form";

export const dynamic = "force-dynamic";

export default async function EditarSesionPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string; dia?: string; volver?: string }>;
}) {
  const user = await requireAuth();
  // Editing is OWNER-only, same gate as the week editor.
  if (user.role !== "OWNER") redirect("/dashboard/srxfit/calendario");

  const params = await searchParams;
  const weekNumber = Number(params.semana);
  const dayIndex = Number(params.dia);
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > TOTAL_WEEKS) notFound();
  if (!Number.isInteger(dayIndex) || dayIndex < 1 || dayIndex > 6) notFound();

  const slot = getWeekSessions(weekNumber).find((s) => s.dayIndex === dayIndex);
  const session = slot?.session;
  if (!slot || !session) notFound();

  const override = await getSessionOverride(weekNumber, dayIndex);
  const hasOverride = !!override && Object.values(override).some((v) => typeof v === "string" && v);

  const [y, m] = slot.date.split("-").map(Number);
  const back = safeBack(params.volver, `/dashboard/srxfit/calendario?year=${y}&month=${m}`);

  return (
    <FormPage
      wide
      title={`Editar programación — Semana ${weekNumber} · Día ${dayIndex}`}
      description={
        <>
          {session.dayName ? `${session.dayName} ${slot.date} · ` : `${slot.date} · `}
          {session.pattern} · {session.dayType}. Edita el contenido de cada bloque en formato libre. Soporta{" "}
          <code>**negrita**</code>, <code>_cursiva_</code> y listas con <code>-</code>. Lo que escribas reemplaza el
          bloque original.
        </>
      }
    >
      <SessionForm
        backHref={back}
        weekNumber={weekNumber}
        dayIndex={dayIndex}
        hasOverride={hasOverride}
        initial={{
          activacionMd: override?.activacionMd ?? activacionToMd(session.blocks.activacion),
          fuerzaMd: override?.fuerzaMd ?? fuerzaToMd(session.blocks.fuerza),
          acondicionamientoMd: override?.acondicionamientoMd ?? acondicionamientoToMd(session.blocks.acondicionamiento),
          regulacionMd: override?.regulacionMd ?? regulacionToMd(session.blocks.regulacion),
          coachNotesMd: override?.coachNotesMd ?? (session.coachNotes ?? ""),
        }}
      />
    </FormPage>
  );
}
