import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getWeekSessions } from "@/lib/srxfit-calendar";
import {
  activacionToMd,
  fuerzaToMd,
  acondicionamientoToMd,
  regulacionToMd,
} from "@/lib/srxfit-md";
import { getWeekOverrides } from "@/lib/actions/srxfit-overrides";
import { WeekEditor, type WeekDayData, type WeekMeta } from "./week-editor";

export const dynamic = "force-dynamic";

function clampWeek(raw: string): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return 1;
  return Math.min(18, Math.max(1, n));
}

export default async function WeekEditorPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const user = await requireAuth();
  // Editing is OWNER-only, same gate as the single-session dialog.
  if (user.role !== "OWNER") redirect("/dashboard/srxfit/calendario");

  const { week } = await params;
  const weekNumber = clampWeek(week);

  const slots = getWeekSessions(weekNumber);
  const overrides = await getWeekOverrides(weekNumber);
  const firstSession = slots.find((s) => s.session)?.session ?? null;

  const days: WeekDayData[] = slots.map(({ dayIndex, date, session }) => {
    const ov = overrides[dayIndex];
    const base = {
      activacionMd: session ? activacionToMd(session.blocks.activacion) : "",
      fuerzaMd: session ? fuerzaToMd(session.blocks.fuerza) : "",
      acondicionamientoMd: session ? acondicionamientoToMd(session.blocks.acondicionamiento) : "",
      regulacionMd: session ? regulacionToMd(session.blocks.regulacion) : "",
      coachNotesMd: session?.coachNotes ?? "",
    };
    const initial = {
      activacionMd: ov?.activacionMd ?? base.activacionMd,
      fuerzaMd: ov?.fuerzaMd ?? base.fuerzaMd,
      acondicionamientoMd: ov?.acondicionamientoMd ?? base.acondicionamientoMd,
      regulacionMd: ov?.regulacionMd ?? base.regulacionMd,
      coachNotesMd: ov?.coachNotesMd ?? base.coachNotesMd,
    };
    const hasOverride =
      !!ov &&
      [ov.activacionMd, ov.fuerzaMd, ov.acondicionamientoMd, ov.regulacionMd, ov.coachNotesMd].some(
        (v) => typeof v === "string" && v.length > 0,
      );

    return {
      dayIndex,
      date,
      dayName: session?.dayName ?? "",
      pattern: session?.pattern ?? "",
      dayType: session?.dayType ?? "",
      hasOverride,
      base,
      initial,
      updatedByName: ov?.updatedByName ?? null,
      updatedAt: ov?.updatedAt ? ov.updatedAt.toISOString() : null,
    };
  });

  const meta: WeekMeta = {
    weekNumber,
    phase: firstSession?.phase ?? "",
    emphasis: firstSession?.emphasis ?? "",
    block: firstSession?.block ?? null,
    weekSummary: firstSession?.weekSummary ?? "",
    breathingTechnique: firstSession?.breathingTechnique ?? "",
  };

  return <WeekEditor meta={meta} days={days} />;
}
