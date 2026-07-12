"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SrxfitSession } from "@/lib/srxfit-calendar";
import {
  activacionToMd, fuerzaToMd, acondicionamientoToMd, regulacionToMd, MarkdownText,
} from "@/lib/srxfit-md";
import { getSessionOverride, type SessionOverrideData } from "@/lib/actions/srxfit-overrides";
import { EditSessionDialog } from "./edit-session-dialog";

interface Props {
  session: SrxfitSession;
  date: string;
  canEdit: boolean;
  onClose: () => void;
}

const BLOCK_COLORS = {
  activacion:        { header: "bg-sky-50 border-sky-200 text-sky-800",         dot: "bg-sky-400" },
  fuerza:            { header: "bg-rose-50 border-rose-200 text-rose-800",      dot: "bg-rose-400" },
  acondicionamiento: { header: "bg-emerald-50 border-emerald-200 text-emerald-800", dot: "bg-emerald-400" },
  regulacion:        { header: "bg-violet-50 border-violet-200 text-violet-800", dot: "bg-violet-400" },
} as const;

const PHASE_BADGE: Record<string, string> = {
  "Aprender":      "bg-blue-100 text-blue-800",
  "Desarrollar":   "bg-amber-100 text-amber-800",
  "Desafiar":      "bg-rose-100 text-rose-800",
  "Recuperar":     "bg-green-100 text-green-800",
  "Re-evaluación": "bg-purple-100 text-purple-800",
};

function BlockHeader({ label, color, duration }: { label: string; color: string; duration?: number }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 border rounded-t-md text-xs font-semibold ${color}`}>
      <span>{label}</span>
      {duration && <span>{duration} min</span>}
    </div>
  );
}

function BulletList({ items, dot }: { items: string[]; dot: string }) {
  return (
    <div className="space-y-1">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2 text-sm">
          <span className={`mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full ${dot}`} />
          <span>{it}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Activación block ───────────────────────────────────────────────

function ActivacionBlock({ data }: { data: unknown }) {
  const d = data as {
    duration_min?: number;
    exercises?: string[];                 // v1
    mobility?: string[];                  // v2
    rounds_format?: string;               // v2
    rounds_content?: string[];            // v2
    cardio_options?: { primary?: string; alternatives?: string[] }; // v2
    rules?: string | string[];
  };
  const { header, dot } = BLOCK_COLORS.activacion;

  return (
    <div className="rounded-md border overflow-hidden">
      <BlockHeader label="① Activación" color={header} duration={d.duration_min} />
      <div className="px-3 py-2 space-y-2">
        {d.exercises && <BulletList items={d.exercises} dot={dot} />}
        {d.mobility && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">Movilidad</p>
            <BulletList items={d.mobility} dot={dot} />
          </div>
        )}
        {d.rounds_format && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">{d.rounds_format}</p>
            {d.rounds_content && <BulletList items={d.rounds_content} dot={dot} />}
          </div>
        )}
        {d.cardio_options && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Cardio:</span> {d.cardio_options.primary}
            {d.cardio_options.alternatives && d.cardio_options.alternatives.length > 0 && (
              <> · alternativas: {d.cardio_options.alternatives.join(" / ")}</>
            )}
          </p>
        )}
        {d.rules && (
          <div className="text-xs text-muted-foreground mt-2 border-t pt-2 italic space-y-1">
            {Array.isArray(d.rules)
              ? d.rules.map((r, i) => <p key={i}>· {r}</p>)
              : <p>{d.rules}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Fuerza block ────────────────────────────────────────────────────

function FuerzaBlock({ data }: { data: unknown }) {
  const d = data as {
    duration_min?: number;
    main_exercise?: { name: string; scheme: string };
    scaling?: { N1?: string; N2?: string; N3?: string };
    stations?: Array<{ name?: string; reps?: string; muscle?: string; focus?: string; exercise?: string; position?: number; pattern?: string; note?: string }>;
    stations_protocol?: string;
    format?: string;
    notes?: string;
    coach_note?: string;
    tests?: Array<{ name: string; protocol?: string; warmup?: string; wod?: string; measurement?: string; vo2_formula?: string; scaling?: string; test_protocol?: string; estimation?: string }>;
    tests_fitness?: Array<{ name: string; protocol?: string; warmup?: string }>;
    alternative_xtreme?: string;
  };
  const { header, dot } = BLOCK_COLORS.fuerza;
  const note = d.coach_note ?? d.notes;

  return (
    <div className="rounded-md border overflow-hidden">
      <BlockHeader label="② Fuerza" color={header} duration={d.duration_min} />
      <div className="px-3 py-2 space-y-3">
        {d.main_exercise && (
          <div className="space-y-1">
            <p className="text-sm font-semibold">{d.main_exercise.name}</p>
            <p className="text-sm text-muted-foreground">{d.main_exercise.scheme}</p>
          </div>
        )}
        {d.scaling && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            {(["N1", "N2", "N3"] as const).map((n) => d.scaling?.[n] && (
              <div key={n} className="rounded border px-2 py-1.5 space-y-0.5">
                <p className="font-semibold">{n}</p>
                <p className="text-muted-foreground">{d.scaling[n]}</p>
              </div>
            ))}
          </div>
        )}

        {d.format && !d.main_exercise && !d.tests && (
          <p className="text-sm font-medium">{d.format}</p>
        )}
        {d.stations && d.stations.length > 0 && !d.tests && (
          <div className="space-y-1">
            {d.stations_protocol && (
              <p className="text-xs text-muted-foreground mb-1">{d.stations_protocol}</p>
            )}
            {d.stations.map((s, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className={`mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full ${dot}`} />
                <span>
                  {s.name ?? s.exercise}
                  {s.reps && <span className="text-muted-foreground ml-1">— {s.reps}</span>}
                  {(s.focus ?? s.muscle) && <span className="text-muted-foreground ml-1">({s.focus ?? s.muscle})</span>}
                  {s.pattern && <span className="text-muted-foreground ml-1">[{s.pattern}]</span>}
                  {s.note && <span className="font-medium text-amber-700 ml-1">{s.note}</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {d.tests && (
          <div className="space-y-3">
            {d.tests.map((t, i) => (
              <div key={i} className="rounded border px-3 py-2 space-y-1 bg-purple-50/50">
                <p className="text-sm font-semibold">{t.name}</p>
                {t.warmup && <p className="text-xs text-muted-foreground">Calentamiento: {t.warmup}</p>}
                {(t.protocol ?? t.test_protocol) && (
                  <p className="text-xs">{t.protocol ?? t.test_protocol}</p>
                )}
                {t.wod && <p className="text-xs font-medium text-purple-800">{t.wod}</p>}
                {t.measurement && <p className="text-xs text-muted-foreground">{t.measurement}</p>}
                {t.vo2_formula && <p className="text-xs text-blue-700">{t.vo2_formula}</p>}
                {t.estimation && <p className="text-xs text-blue-700">{t.estimation}</p>}
                {t.scaling && <p className="text-xs text-muted-foreground italic">{t.scaling}</p>}
              </div>
            ))}
          </div>
        )}

        {d.tests_fitness && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">La Cueva Fitness Center:</p>
            {d.tests_fitness.map((t, i) => (
              <div key={i} className="rounded border px-3 py-2 space-y-0.5">
                <p className="text-sm font-semibold">{t.name}</p>
                {t.warmup && <p className="text-xs text-muted-foreground">{t.warmup}</p>}
                {t.protocol && <p className="text-xs">{t.protocol}</p>}
              </div>
            ))}
            {d.alternative_xtreme && (
              <p className="text-xs text-muted-foreground border-t pt-2">Xtreme: {d.alternative_xtreme}</p>
            )}
          </div>
        )}

        {note && (
          <div className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5 text-amber-800">
            ⚠️ {note}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Acondicionamiento block ─────────────────────────────────────────

function AcondicionamientoBlock({ data }: { data: unknown }) {
  const d = data as {
    duration_min?: number;
    format?: string;
    zone?: string;
    description?: string;
    scaling?: string;
    objective?: string;
  };
  const { header } = BLOCK_COLORS.acondicionamiento;
  if (!d.duration_min && !d.format) return null;
  return (
    <div className="rounded-md border overflow-hidden">
      <BlockHeader label="③ Acondicionamiento" color={header} duration={d.duration_min} />
      <div className="px-3 py-2 space-y-1.5">
        {(d.format || d.zone) && (
          <div className="flex items-center gap-2 flex-wrap">
            {d.format && <span className="text-sm font-medium">{d.format}</span>}
            {d.zone && <span className="px-1.5 py-0.5 text-xs rounded bg-emerald-100 text-emerald-800">{d.zone}</span>}
          </div>
        )}
        {d.description && <p className="text-sm text-muted-foreground whitespace-pre-line">{d.description}</p>}
        {d.objective && (
          <p className="text-xs text-muted-foreground italic">{d.objective}</p>
        )}
        {d.scaling && (
          <p className="text-xs text-muted-foreground border-t pt-2">{d.scaling}</p>
        )}
      </div>
    </div>
  );
}

// ─── Regulación block ─────────────────────────────────────────────────

function RegulacionBlock({ data }: { data: unknown }) {
  const d = data as {
    duration_min?: number;
    mobility?: string[] | { duration_min?: number; exercises?: string[] };
    breathing?: { technique?: string; duration_min?: number; instructions?: string };
    closing?: string | { duration_seconds?: string | number; message?: string };
  };
  const { header, dot } = BLOCK_COLORS.regulacion;

  // Normalize mobility into a list of strings
  let mobilityItems: string[] = [];
  if (Array.isArray(d.mobility)) {
    mobilityItems = d.mobility;
  } else if (d.mobility && typeof d.mobility === "object" && Array.isArray(d.mobility.exercises)) {
    mobilityItems = d.mobility.exercises;
  }

  // Normalize closing into a string
  let closingText: string | null = null;
  if (typeof d.closing === "string") closingText = d.closing;
  else if (d.closing && typeof d.closing === "object" && d.closing.message) closingText = d.closing.message;

  return (
    <div className="rounded-md border overflow-hidden">
      <BlockHeader label="④ Regulación" color={header} duration={d.duration_min} />
      <div className="px-3 py-2 space-y-2">
        {mobilityItems.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">Movilidad regenerativa</p>
            <BulletList items={mobilityItems} dot={dot} />
          </div>
        )}
        {d.breathing && (
          <div className="rounded border border-violet-200 bg-violet-50/50 px-2 py-1.5 space-y-0.5">
            <p className="text-xs font-semibold text-violet-800">
              Respiración{d.breathing.duration_min ? ` — ${d.breathing.duration_min} min` : ""}
            </p>
            {d.breathing.technique && <p className="text-sm">{d.breathing.technique}</p>}
            {d.breathing.instructions && (
              <p className="text-xs text-muted-foreground">{d.breathing.instructions}</p>
            )}
          </div>
        )}
        {closingText && (
          <p className="text-xs text-muted-foreground italic">{closingText}</p>
        )}
      </div>
    </div>
  );
}

// ─── Override block (markdown rendered) ──────────────────────────────

function OverrideBlock({
  label, color, source,
}: { label: string; color: string; source: string }) {
  return (
    <div className="rounded-md border overflow-hidden">
      <BlockHeader label={label} color={color} />
      <div className="px-3 py-2">
        <MarkdownText source={source} />
      </div>
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────

export function SessionModal({ session, date, canEdit, onClose }: Props) {
  const phaseBadge = PHASE_BADGE[session.phase] ?? PHASE_BADGE["Aprender"];
  const [y, m, d] = date.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dateLabel = dateObj.toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const dayIndex = dateObj.getDay(); // 1=Mon ... 6=Sat for training days
  const weekNumber = session.weekNumber;

  const [override, setOverride] = useState<SessionOverrideData | null>(null);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSessionOverride(weekNumber, dayIndex)
      .then((o) => { if (!cancelled) { setOverride(o); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [weekNumber, dayIndex]);

  const hasOverride = !!override && Object.values(override).some((v) => typeof v === "string" && v);

  function refreshOverride() {
    setEditing(false);
    getSessionOverride(weekNumber, dayIndex).then(setOverride).catch(() => {});
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${phaseBadge}`}>
                  {session.phase}
                </span>
                <span className="text-xs text-muted-foreground">
                  Semana {session.weekNumber} · Bloque {session.block} · {session.emphasis}
                </span>
                {hasOverride && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    Editado
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold capitalize">{dateLabel}</h2>
              <p className="text-sm text-muted-foreground">
                {session.pattern} · {session.dayType}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {canEdit && loaded && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs px-2 py-1 rounded border hover:bg-accent transition"
                >
                  Editar día
                </button>
              )}
              {canEdit && (
                <Link
                  href={`/dashboard/srxfit/calendario/semana/${weekNumber}`}
                  className="text-xs px-2 py-1 rounded border hover:bg-accent transition"
                >
                  Editar semana
                </Link>
              )}
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-muted transition text-muted-foreground"
                aria-label="Cerrar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {session.weekSummary && (
            <p className="text-xs text-muted-foreground border-t pt-2">{session.weekSummary}</p>
          )}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {/* Activación */}
          {override?.activacionMd
            ? <OverrideBlock label="① Activación" color={BLOCK_COLORS.activacion.header} source={override.activacionMd} />
            : Boolean(session.blocks.activacion) && <ActivacionBlock data={session.blocks.activacion} />}

          {/* Fuerza */}
          {override?.fuerzaMd
            ? <OverrideBlock label="② Fuerza" color={BLOCK_COLORS.fuerza.header} source={override.fuerzaMd} />
            : Boolean(session.blocks.fuerza) && <FuerzaBlock data={session.blocks.fuerza} />}

          {/* Acondicionamiento */}
          {override?.acondicionamientoMd
            ? <OverrideBlock label="③ Acondicionamiento" color={BLOCK_COLORS.acondicionamiento.header} source={override.acondicionamientoMd} />
            : Boolean(session.blocks.acondicionamiento) && <AcondicionamientoBlock data={session.blocks.acondicionamiento} />}

          {/* Regulación */}
          {override?.regulacionMd
            ? <OverrideBlock label="④ Regulación" color={BLOCK_COLORS.regulacion.header} source={override.regulacionMd} />
            : Boolean(session.blocks.regulacion) && <RegulacionBlock data={session.blocks.regulacion} />}

          {(override?.coachNotesMd ?? session.coachNotes) && (
            <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold text-xs mb-1">NOTA PARA EL COACH</p>
              {override?.coachNotesMd
                ? <MarkdownText source={override.coachNotesMd} />
                : <p>{session.coachNotes}</p>}
            </div>
          )}
          <div className="text-xs text-muted-foreground border-t pt-3">
            Respiración: {session.breathingTechnique}
          </div>
          {hasOverride && override?.updatedAt && (
            <p className="text-[10px] text-muted-foreground">
              Editado{override.updatedByName ? ` por ${override.updatedByName}` : ""} ·{" "}
              {new Date(override.updatedAt).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
      </div>

      {editing && (
        <EditSessionDialog
          open={editing}
          onClose={(refreshed) => refreshed ? refreshOverride() : setEditing(false)}
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
      )}
    </div>
  );
}
