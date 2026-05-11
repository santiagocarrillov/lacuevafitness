import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  buildMonthCalendar,
  prevMonth,
  nextMonth,
  isoDate,
  MONTH_NAMES_ES,
  SRXFIT_START,
  SRXFIT_END,
} from "@/lib/srxfit-calendar";
import { CalendarGrid } from "./calendar-grid";

export const dynamic = "force-dynamic";

function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await requireAuth();
  const canEdit = user.role === "OWNER";

  const params = await searchParams;
  const now = new Date();

  // Default to the plan start month if we're before it, otherwise current month
  const defaultYear = now < SRXFIT_START ? SRXFIT_START.getFullYear() : now.getFullYear();
  const defaultMonth = now < SRXFIT_START ? SRXFIT_START.getMonth() + 1 : now.getMonth() + 1;

  const year = params.year ? clamp(parseInt(params.year), 2026, 2027) : defaultYear;
  const month = params.month ? clamp(parseInt(params.month), 1, 12) : defaultMonth;

  const planStartYear = SRXFIT_START.getFullYear();
  const planStartMonth = SRXFIT_START.getMonth() + 1;
  const planEndYear = SRXFIT_END.getFullYear();
  const planEndMonth = SRXFIT_END.getMonth() + 1;

  const canGoPrev = year > planStartYear || (year === planStartYear && month > planStartMonth);
  const canGoNext = year < planEndYear || (year === planEndYear && month < planEndMonth);

  const weeks = buildMonthCalendar(year, month);
  const monthLabel = `${MONTH_NAMES_ES[month]} ${year}`;

  // Count sessions in this month
  const sessionCount = weeks.flat().filter((c) => c.isCurrentMonth && c.session).length;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href="/dashboard/srxfit" className="text-sm text-muted-foreground hover:text-foreground">
              SRXFit
            </Link>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-2xl font-semibold">Calendario de Programación</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Plan de 18 semanas · 108 sesiones ·{" "}
            {isoDate(SRXFIT_START)} → {isoDate(SRXFIT_END)}
          </p>
        </div>
        <div className="text-right space-y-0.5">
          <p className="text-sm font-medium">{sessionCount} sesiones este mes</p>
          <p className="text-xs text-muted-foreground">Domingo = día libre</p>
        </div>
      </div>

      {/* Calendar */}
      <CalendarGrid
        weeks={weeks}
        year={year}
        month={month}
        monthLabel={monthLabel}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        canEdit={canEdit}
      />

      {/* Plan overview strip */}
      <div className="rounded-lg border p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Meses del plan
        </p>
        <div className="flex flex-wrap gap-1">
          {[
            { y: 2026, m: 5 }, { y: 2026, m: 6 }, { y: 2026, m: 7 },
            { y: 2026, m: 8 }, { y: 2026, m: 9 },
          ].map(({ y, m }) => (
            <Link
              key={`${y}-${m}`}
              href={`/dashboard/srxfit/calendario?year=${y}&month=${m}`}
              className={`px-2.5 py-1 text-xs rounded-md border transition ${
                year === y && month === m
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-accent"
              }`}
            >
              {MONTH_NAMES_ES[m]} {y}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
