"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCell, SrxfitSession, getPhaseStyle, getPatternLabel } from "@/lib/srxfit-calendar";
import { SessionModal } from "./session-modal";

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

interface Props {
  weeks: CalendarCell[][];
  year: number;
  month: number;
  monthLabel: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  canEdit: boolean;
}

export function CalendarGrid({ weeks, year, month, monthLabel, canGoPrev, canGoNext, canEdit }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ session: SrxfitSession; date: string } | null>(null);

  function navigate(y: number, m: number) {
    router.push(`/dashboard/srxfit/calendario?year=${y}&month=${m}`);
  }

  function prev() {
    if (!canGoPrev) return;
    if (month === 1) navigate(year - 1, 12);
    else navigate(year, month - 1);
  }

  function next() {
    if (!canGoNext) return;
    if (month === 12) navigate(year + 1, 1);
    else navigate(year, month + 1);
  }

  return (
    <>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prev}
          disabled={!canGoPrev}
          className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Anterior
        </button>
        <h2 className="text-lg font-semibold">{monthLabel}</h2>
        <button
          onClick={next}
          disabled={!canGoNext}
          className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Siguiente →
        </button>
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="border-l border-t rounded-tl-md">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((cell, di) => {
              const { session } = cell;
              const phaseStyle = session ? getPhaseStyle(session.phase) : null;
              const patternLabel = session ? getPatternLabel(session.pattern) : null;

              return (
                <div
                  key={cell.date}
                  onClick={() => session && setSelected({ session, date: cell.date })}
                  className={`min-h-[88px] border-r border-b p-1.5 flex flex-col gap-1 transition ${
                    !cell.isCurrentMonth ? "bg-muted/20" : ""
                  } ${cell.isToday ? "bg-sky-50" : ""} ${
                    session ? "cursor-pointer hover:bg-accent/50" : ""
                  }`}
                >
                  {/* Day number */}
                  <div className="flex items-start justify-between">
                    <span
                      className={`text-xs leading-none font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                        cell.isToday
                          ? "bg-primary text-primary-foreground"
                          : !cell.isCurrentMonth
                          ? "text-muted-foreground/50"
                          : "text-foreground"
                      }`}
                    >
                      {parseInt(cell.date.split("-")[2])}
                    </span>
                    {session && (
                      <span className="text-[9px] text-muted-foreground leading-none">
                        S{session.weekNumber}
                      </span>
                    )}
                  </div>

                  {/* Session pill */}
                  {session && phaseStyle && (
                    <div
                      className={`rounded px-1.5 py-1 border text-[10px] leading-tight space-y-0.5 ${phaseStyle.pill}`}
                    >
                      <p className="font-semibold truncate">{patternLabel}</p>
                      <p className="opacity-75 truncate">{session.phase}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Phase legend */}
      <div className="flex flex-wrap gap-3 mt-4 text-xs">
        {[
          { phase: "Aprender",      cls: "bg-blue-100 text-blue-800 border-blue-200 border" },
          { phase: "Desarrollar",   cls: "bg-amber-100 text-amber-800 border-amber-200 border" },
          { phase: "Desafiar",      cls: "bg-rose-100 text-rose-800 border-rose-200 border" },
          { phase: "Recuperar",     cls: "bg-green-100 text-green-800 border-green-200 border" },
          { phase: "Re-evaluación", cls: "bg-purple-100 text-purple-800 border-purple-200 border" },
        ].map((p) => (
          <span key={p.phase} className={`px-2 py-0.5 rounded-full ${p.cls}`}>{p.phase}</span>
        ))}
        <span className="text-muted-foreground">· Click en un día para ver la sesión completa</span>
      </div>

      {/* Session modal */}
      {selected && (
        <SessionModal
          session={selected.session}
          date={selected.date}
          canEdit={canEdit}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
