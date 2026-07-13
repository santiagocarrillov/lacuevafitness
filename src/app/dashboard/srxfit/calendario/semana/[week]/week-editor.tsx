"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/lib/srxfit-md";
import {
  upsertWeekOverrides,
  deleteSessionOverride,
  type WeekDayOverrideInput,
} from "@/lib/actions/srxfit-overrides";

// ─── Types (shared with the server page) ─────────────────────────────

type BlockFields = {
  activacionMd: string;
  fuerzaMd: string;
  acondicionamientoMd: string;
  regulacionMd: string;
  coachNotesMd: string;
};

export type WeekDayData = {
  dayIndex: number;
  date: string; // YYYY-MM-DD
  dayName: string;
  pattern: string;
  dayType: string;
  hasOverride: boolean;
  base: BlockFields;
  initial: BlockFields;
  updatedByName: string | null;
  updatedAt: string | null;
};

export type WeekMeta = {
  weekNumber: number;
  phase: string;
  emphasis: string;
  block: number | null;
  weekSummary: string;
  breathingTechnique: string;
};

// ─── Presentation constants ──────────────────────────────────────────

const PHASE_BADGE: Record<string, string> = {
  Aprender: "bg-blue-100 text-blue-800 border-blue-200",
  Desarrollar: "bg-amber-100 text-amber-800 border-amber-200",
  Desafiar: "bg-rose-100 text-rose-800 border-rose-200",
  Recuperar: "bg-green-100 text-green-800 border-green-200",
  "Re-evaluación": "bg-purple-100 text-purple-800 border-purple-200",
};

const BLOCKS: Array<{ key: keyof BlockFields; label: string; accent: string; rows: number }> = [
  { key: "activacionMd", label: "① Activación", accent: "border-l-sky-400", rows: 6 },
  { key: "fuerzaMd", label: "② Fuerza", accent: "border-l-rose-400", rows: 6 },
  { key: "acondicionamientoMd", label: "③ Acondicionamiento", accent: "border-l-emerald-400", rows: 5 },
  { key: "regulacionMd", label: "④ Regulación", accent: "border-l-violet-400", rows: 5 },
  { key: "coachNotesMd", label: "Nota para el coach", accent: "border-l-amber-400", rows: 2 },
];

const WEEKDAY: Record<number, string> = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado" };
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

function fieldsEqual(a: BlockFields, b: BlockFields): boolean {
  return (
    a.activacionMd === b.activacionMd &&
    a.fuerzaMd === b.fuerzaMd &&
    a.acondicionamientoMd === b.acondicionamientoMd &&
    a.regulacionMd === b.regulacionMd &&
    a.coachNotesMd === b.coachNotesMd
  );
}

function toNull(fields: BlockFields): Omit<WeekDayOverrideInput, "dayIndex"> {
  const clean = (s: string) => {
    const t = s.trim();
    return t.length ? t : null;
  };
  return {
    activacionMd: clean(fields.activacionMd),
    fuerzaMd: clean(fields.fuerzaMd),
    acondicionamientoMd: clean(fields.acondicionamientoMd),
    regulacionMd: clean(fields.regulacionMd),
    coachNotesMd: clean(fields.coachNotesMd),
  };
}

// ─── Auto-growing textarea ───────────────────────────────────────────

function AutoTextarea({
  value,
  onChange,
  minRows,
}: {
  value: string;
  onChange: (v: string) => void;
  minRows: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={minRows}
      spellCheck={false}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed resize-none overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

// ─── Main editor ─────────────────────────────────────────────────────

export function WeekEditor({ meta, days }: { meta: WeekMeta; days: WeekDayData[] }) {
  const router = useRouter();
  const [isSaving, startSave] = useTransition();
  const [restoring, setRestoring] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);

  // live form state + the baseline we diff against
  const [forms, setForms] = useState<Record<number, BlockFields>>(() =>
    Object.fromEntries(days.map((d) => [d.dayIndex, { ...d.initial }])),
  );
  const [baseline, setBaseline] = useState<Record<number, BlockFields>>(() =>
    Object.fromEntries(days.map((d) => [d.dayIndex, { ...d.initial }])),
  );
  const [overrideFlags, setOverrideFlags] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(days.map((d) => [d.dayIndex, d.hasOverride])),
  );

  const baseByDay = useMemo(
    () => Object.fromEntries(days.map((d) => [d.dayIndex, d.base])) as Record<number, BlockFields>,
    [days],
  );

  const dirtyDays = useMemo(
    () => days.map((d) => d.dayIndex).filter((di) => !fieldsEqual(forms[di], baseline[di])),
    [forms, baseline, days],
  );
  const dirtyCount = dirtyDays.length;

  // warn before leaving with unsaved changes
  useEffect(() => {
    if (dirtyCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyCount]);

  function updateField(dayIndex: number, key: keyof BlockFields, value: string) {
    setForms((f) => ({ ...f, [dayIndex]: { ...f[dayIndex], [key]: value } }));
  }

  function resetToBase(dayIndex: number) {
    setForms((f) => ({ ...f, [dayIndex]: { ...baseByDay[dayIndex] } }));
  }

  function discardAll() {
    if (dirtyCount > 0 && !confirm("¿Descartar todos los cambios sin guardar de esta semana?")) return;
    setForms({ ...baseline });
  }

  function handleSave() {
    if (dirtyCount === 0) return;
    startSave(async () => {
      try {
        const payload: WeekDayOverrideInput[] = dirtyDays.map((di) => ({
          dayIndex: di,
          ...toNull(forms[di]),
        }));
        await upsertWeekOverrides(meta.weekNumber, payload);
        // advance the baseline; the saved days are now the new "clean" state
        setBaseline((b) => {
          const next = { ...b };
          for (const di of dirtyDays) next[di] = { ...forms[di] };
          return next;
        });
        setOverrideFlags((flags) => {
          const next = { ...flags };
          for (const di of dirtyDays) next[di] = true;
          return next;
        });
        toast.success(
          `Semana ${meta.weekNumber} guardada · ${dirtyDays.length} ${dirtyDays.length === 1 ? "sesión" : "sesiones"}.`,
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  function handleRestore(dayIndex: number) {
    if (!confirm(`¿Restaurar el día ${WEEKDAY[dayIndex]} a la programación original? Se borrará su edición guardada.`))
      return;
    setRestoring(dayIndex);
    (async () => {
      try {
        await deleteSessionOverride(meta.weekNumber, dayIndex);
        const base = { ...baseByDay[dayIndex] };
        setForms((f) => ({ ...f, [dayIndex]: base }));
        setBaseline((b) => ({ ...b, [dayIndex]: base }));
        setOverrideFlags((flags) => ({ ...flags, [dayIndex]: false }));
        toast.success(`${WEEKDAY[dayIndex]} restaurado al original.`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al restaurar");
      } finally {
        setRestoring(null);
      }
    })();
  }

  const phaseBadge = PHASE_BADGE[meta.phase] ?? PHASE_BADGE["Aprender"];
  const prevWeek = meta.weekNumber > 1 ? meta.weekNumber - 1 : null;
  const nextWeek = meta.weekNumber < 18 ? meta.weekNumber + 1 : null;

  return (
    <div className="pb-28">
      {/* ── Sticky header / save bar ── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="px-6 md:px-8 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard/srxfit/calendario"
              className="text-sm text-muted-foreground hover:text-foreground shrink-0"
            >
              ← Calendario
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold truncate">Semana {meta.weekNumber}</h1>
                {meta.phase && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${phaseBadge}`}>
                    {meta.phase}
                  </span>
                )}
                {meta.emphasis && (
                  <span className="text-xs text-muted-foreground truncate">{meta.emphasis}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className="text-xs px-2.5 py-1.5 rounded-md border hover:bg-accent transition"
            >
              {preview ? "✎ Editar" : "👁 Vista previa"}
            </button>
            {dirtyCount > 0 && (
              <>
                <span className="text-xs text-amber-700 font-medium tabular-nums hidden sm:inline">
                  {dirtyCount} {dirtyCount === 1 ? "sesión" : "sesiones"} sin guardar
                </span>
                <Button variant="outline" size="sm" onClick={discardAll} disabled={isSaving}>
                  Descartar
                </Button>
              </>
            )}
            <Button size="sm" onClick={handleSave} disabled={isSaving || dirtyCount === 0}>
              {isSaving ? "Guardando…" : dirtyCount > 0 ? `Guardar semana (${dirtyCount})` : "Guardado"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Week meta strip ── */}
      <div className="px-6 md:px-8 pt-5 space-y-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-muted-foreground max-w-3xl">{meta.weekSummary}</p>
          <div className="flex items-center gap-1 shrink-0">
            {prevWeek && (
              <Link
                href={`/dashboard/srxfit/calendario/semana/${prevWeek}`}
                className="text-xs px-2 py-1 rounded-md border hover:bg-accent transition"
              >
                ← Sem {prevWeek}
              </Link>
            )}
            {nextWeek && (
              <Link
                href={`/dashboard/srxfit/calendario/semana/${nextWeek}`}
                className="text-xs px-2 py-1 rounded-md border hover:bg-accent transition"
              >
                Sem {nextWeek} →
              </Link>
            )}
          </div>
        </div>
        {meta.breathingTechnique && (
          <p className="text-xs text-muted-foreground">
            Respiración del bloque: <span className="font-medium">{meta.breathingTechnique}</span>
          </p>
        )}
      </div>

      {/* ── Day cards ── */}
      <div className="px-6 md:px-8 py-5 grid gap-4 xl:grid-cols-2">
        {days.map((day) => {
          const isDirty = !fieldsEqual(forms[day.dayIndex], baseline[day.dayIndex]);
          const isTest = /TEST|3RM|Christine|Cooper|Snatch|C&J/i.test(
            `${day.pattern} ${forms[day.dayIndex].fuerzaMd}`,
          );
          return (
            <section
              key={day.dayIndex}
              className={`rounded-xl border bg-card overflow-hidden ${isDirty ? "ring-1 ring-amber-300 border-amber-300" : ""}`}
            >
              {/* card header */}
              <header className="flex items-start justify-between gap-3 px-4 py-3 border-b bg-muted/40">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{WEEKDAY[day.dayIndex]}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(day.date)}</span>
                    {isTest && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                        TEST
                      </span>
                    )}
                    {overrideFlags[day.dayIndex] && !isDirty && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Editado
                      </span>
                    )}
                    {isDirty && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        Sin guardar
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {day.pattern}
                    {day.dayType ? ` · ${day.dayType}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isDirty && (
                    <button
                      type="button"
                      onClick={() => resetToBase(day.dayIndex)}
                      className="text-[11px] px-2 py-1 rounded border hover:bg-accent transition"
                      title="Revertir este día al plan base (sin guardar)"
                    >
                      Revertir
                    </button>
                  )}
                  {overrideFlags[day.dayIndex] && (
                    <button
                      type="button"
                      onClick={() => handleRestore(day.dayIndex)}
                      disabled={restoring === day.dayIndex}
                      className="text-[11px] px-2 py-1 rounded border text-red-600 hover:text-red-700 hover:bg-red-50 transition"
                      title="Borrar la edición guardada y volver al plan original"
                    >
                      {restoring === day.dayIndex ? "…" : "Restaurar original"}
                    </button>
                  )}
                </div>
              </header>

              {/* blocks */}
              <div className="p-4 space-y-3">
                {BLOCKS.map((block) => {
                  const value = forms[day.dayIndex][block.key];
                  return (
                    <div key={block.key} className={`pl-3 border-l-2 ${block.accent}`}>
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {block.label}
                      </label>
                      <div className="mt-1">
                        {preview ? (
                          value.trim() ? (
                            <div className="rounded-md border bg-background px-3 py-2">
                              <MarkdownText source={value} />
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic px-1 py-2">
                              (bloque vacío — se oculta / usa el plan base)
                            </p>
                          )
                        ) : (
                          <AutoTextarea
                            value={value}
                            onChange={(v) => updateField(day.dayIndex, block.key, v)}
                            minRows={block.rows}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
