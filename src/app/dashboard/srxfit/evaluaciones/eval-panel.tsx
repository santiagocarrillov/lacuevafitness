"use client";

// Evaluation panel over Evaluaciones (?socio=…). Three columns — body, strength,
// conditioning — and every value saves on its own when the field loses focus
// (or on Enter). No "Guardar evaluación": the weighted score updates live and
// at ≥ 60 % the evaluation counts as done.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Activity, ArrowLeft, ArrowRight, Check, Dumbbell, HeartPulse, Loader2, Scale, X } from "lucide-react";
import type { TestKey } from "@/generated/prisma/client";
import { saveEvalBodyField, saveEvalSummary, saveEvalTest } from "@/lib/actions/srxfit";
import type { EvalPanelData, PanelBody } from "@/lib/srxfit/eval-panel";
import { EVAL_COMPLETE_PCT, STATUS_COLOR, evalScore, evalStatus } from "@/lib/srxfit/eval-score";
import { TEST_LABELS } from "@/lib/portal/test-labels";
import { StatusBadge } from "./status-badge";

// ─── Test metadata ───────────────────────────────────────────────────

type TestMeta = {
  key: TestKey;
  label: string;
  hint: string;
  isTime?: boolean;
  derived?: (v: number) => string;
};

const oneRm = (v: number) => `1RM ≈ ${(v * 1.08).toFixed(1)} kg`;

// Days follow the week-9 battery of the SRXFIT manual v3 (10.3).
const STRENGTH: TestMeta[] = [
  { key: "BACK_SQUAT_3RM", label: "Back squat 3RM", hint: "Lunes · peso del 3RM técnico", derived: oneRm },
  { key: "DEADLIFT_3RM", label: "Deadlift 3RM", hint: "Lunes · peso del 3RM técnico", derived: oneRm },
  { key: "BENCH_PRESS_3RM", label: "Bench press 3RM", hint: "Martes · peso del 3RM técnico", derived: oneRm },
  { key: "PUSH_PRESS_3RM", label: "Push press 3RM", hint: "Martes · peso del 3RM técnico", derived: oneRm },
  { key: "PULL_UPS_MAX", label: "Pull-ups strict", hint: "Viernes · reps en rango completo" },
  { key: "RING_ROW_ANGLE", label: "Ring row (si no hace pull-ups)", hint: "Viernes · ángulo del cuerpo" },
  { key: "PLANK_SECONDS", label: "Plank", hint: "Viernes · antes del benchmark · segundos hasta perder la forma" },
  { key: "DEAD_HANG_SECONDS", label: "Dead hang", hint: "Viernes · antes del benchmark · segundos hasta soltar" },
];

// Low-impact members skip the jump: the field stays empty ("no aplica"), never a zero.
const POWER: TestMeta[] = [
  { key: "BROAD_JUMP_CM", label: "Salto largo", hint: "Lunes, antes del squat · mejor de 3 · aterrizaje sostenido" },
];

const CONDITIONING: TestMeta[] = [
  { key: "CHRISTINE_TIME_SECONDS", label: "Christine 3 RFT", hint: "Viernes · 500 m remo + 12 DL + 21 box jumps", isTime: true },
  {
    key: "COOPER_METERS", label: "Cooper 12 min", hint: "Sábado · metros recorridos",
    derived: (v) => `VO₂max ≈ ${((v - 504.9) / 44.73).toFixed(1)} ml/kg/min`,
  },
];

const OLYMPIC: TestMeta[] = [
  { key: "CLEAN_JERK_1RM", label: "Clean & jerk 1RM", hint: "Miércoles · con base técnica" },
  { key: "SNATCH_1RM", label: "Snatch 1RM", hint: "Jueves · con base técnica" },
  { key: "ROW_500M_SPRINT_SECONDS", label: "Remo 500 m sprint", hint: "Sábado · desde parado", isTime: true },
];

type BodyMeta = { key: Exclude<keyof PanelBody, "notes">; label: string; unit: string; step: string; betterDir?: "up" | "down" };

const BODY: BodyMeta[] = [
  { key: "weightKg", label: "Peso", unit: "kg", step: "0.1" },
  { key: "bodyFatPct", label: "% grasa", unit: "%", step: "0.1", betterDir: "down" },
  { key: "muscleMassPct", label: "% músculo", unit: "%", step: "0.1", betterDir: "up" },
  { key: "heightCm", label: "Talla", unit: "cm", step: "1" },
  { key: "waistCm", label: "Cintura", unit: "cm", step: "0.1", betterDir: "down" },
  { key: "hipCm", label: "Cadera", unit: "cm", step: "0.1" },
  { key: "basalMetabolism", label: "Metabolismo basal", unit: "kcal", step: "1" },
];

const LEVEL_LABELS: Record<string, string> = { LEVEL_1: "Nivel 1", LEVEL_2: "Nivel 2", LEVEL_3: "Nivel 3" };
const TYPE_LABELS: Record<string, string> = { ONBOARDING: "Evaluación inicial", CYCLE_9_WEEK: "Re-evaluación", AD_HOC: "Evaluación ad hoc" };

// ─── Helpers ─────────────────────────────────────────────────────────

function timeToSeconds(val: string): number | null {
  const v = val.trim();
  if (!v) return null;
  if (!v.includes(":")) return Number(v) || null;
  const [mm, ss] = v.split(":").map(Number);
  const s = (mm || 0) * 60 + (ss || 0);
  return s > 0 ? s : null;
}

function secondsToTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "2-digit" });
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

type SaveState = "idle" | "saving" | "saved" | "error";

function SaveMark({ state }: { state: SaveState }) {
  if (state === "saving") return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
  if (state === "saved") return <Check className="size-3.5 text-emerald-600" />;
  if (state === "error") return <X className="size-3.5 text-red-600" />;
  return <span className="size-3.5" />;
}

function Delta({ now, prev, betterDir, isTime }: { now: number | null; prev?: number; betterDir?: "up" | "down"; isTime?: boolean }) {
  if (now == null || prev == null || now === prev) return null;
  const diff = now - prev;
  const good = betterDir ? (betterDir === "up" ? diff > 0 : diff < 0) : null;
  const cls = good == null ? "text-muted-foreground" : good ? "text-emerald-700" : "text-red-600";
  const shown = isTime ? `${diff > 0 ? "+" : "−"}${secondsToTime(Math.abs(diff))}` : `${diff > 0 ? "+" : ""}${fmt(diff)}`;
  return <span className={`font-medium ${cls}`}>{shown}</span>;
}

// ─── One auto-saving field ───────────────────────────────────────────

function Field({
  label, hint, unit, step = "0.1", isTime, initial, prev, betterDir, derived, disabled, onSave,
}: {
  label: string;
  hint?: string;
  unit: string;
  step?: string;
  isTime?: boolean;
  initial: number | null;
  prev?: { value: number; at: string };
  betterDir?: "up" | "down";
  derived?: (v: number) => string;
  disabled?: boolean;
  onSave: (value: number | null) => Promise<void>;
}) {
  const show = (v: number | null) => (v == null ? "" : isTime ? secondsToTime(v) : String(v));
  const [text, setText] = useState(show(initial));
  const [committed, setCommitted] = useState<number | null>(initial);
  const [state, setState] = useState<SaveState>("idle");

  const parsed = isTime ? timeToSeconds(text) : text.trim() === "" ? null : Number(text);

  async function commit() {
    if (parsed !== null && !(Number.isFinite(parsed) && parsed > 0)) {
      setState("error");
      toast.error(`${label}: valor inválido`);
      return;
    }
    if (parsed === committed) return;
    setState("saving");
    try {
      await onSave(parsed);
      setCommitted(parsed);
      setState("saved");
    } catch (e) {
      setState("error");
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">{label}</p>
          {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <input
            inputMode="decimal"
            type={isTime ? "text" : "number"}
            step={isTime ? undefined : step}
            min="0"
            placeholder={isTime ? "mm:ss" : "—"}
            value={text}
            disabled={disabled}
            onChange={(e) => { setText(e.target.value); if (state !== "saving") setState("idle"); }}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className={`h-9 w-24 rounded-lg border bg-white px-2.5 text-right text-sm tabular-nums outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-200 disabled:bg-stone-50 ${
              state === "error" ? "border-red-400" : committed != null ? "border-stone-300" : "border-stone-200"
            }`}
          />
          <span className="w-9 text-[11px] text-muted-foreground">{unit}</span>
          <SaveMark state={state} />
        </div>
      </div>
      {(prev || (derived && parsed && parsed > 0)) && (
        <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-[11px]">
          <span className="text-muted-foreground">
            {prev && (
              <>
                Antes: {isTime ? secondsToTime(prev.value) : fmt(prev.value)} {isTime ? "" : unit} · {shortDate(prev.at)}{" "}
                <Delta now={parsed} prev={prev.value} betterDir={betterDir} isTime={isTime} />
              </>
            )}
          </span>
          {derived && parsed != null && parsed > 0 && <span className="font-medium text-[#3a8fd1]">{derived(parsed)}</span>}
        </div>
      )}
    </div>
  );
}

function Column({ title, icon: Icon, color, aside, children }: {
  title: string; icon: typeof Scale; color: string; aside?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-stone-200 bg-white">
      <header className="flex items-center justify-between gap-2 border-t-2 px-4 py-3" style={{ borderTopColor: color }}>
        <h3 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color }}>
          <Icon className="size-4" /> {title}
        </h3>
        {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
      </header>
      <div className="divide-y divide-stone-100 border-t border-stone-100 px-4">{children}</div>
    </section>
  );
}

function ScoreRing({ pct }: { pct: number }) {
  const status = evalStatus(pct);
  const color = STATUS_COLOR[status];
  const r = 26;
  const c = 2 * Math.PI * r;
  const mark = (EVAL_COMPLETE_PCT / 100) * 2 * Math.PI - Math.PI / 2;
  return (
    <svg viewBox="0 0 64 64" className="size-16 shrink-0" aria-label={`Avance ${pct}%`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#ece8e1" strokeWidth="6" />
      <circle
        cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 32 32)"
        style={{ transition: "stroke-dasharray 300ms" }}
      />
      {/* the 60 % line */}
      <line
        x1={32 + 21 * Math.cos(mark)} y1={32 + 21 * Math.sin(mark)}
        x2={32 + 31 * Math.cos(mark)} y2={32 + 31 * Math.sin(mark)}
        stroke="#57534e" strokeWidth="1.5"
      />
      <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="700" fill={color}>{pct}%</text>
    </svg>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────

export function EvalPanel({
  data, from, to, closeHref, prevHref, nextHref, canEditTests, canEditBody,
}: {
  data: EvalPanelData;
  from: string;
  to: string;
  closeHref: string;
  prevHref: string | null;
  nextHref: string | null;
  canEditTests: boolean;
  canEditBody: boolean;
}) {
  const router = useRouter();
  const { member } = data;
  const [evaluationId, setEvaluationId] = useState<string | null>(data.evaluation?.id ?? null);
  const [tests, setTests] = useState<Partial<Record<TestKey, number>>>(data.tests);
  const [body, setBody] = useState<Partial<PanelBody>>(data.body ?? {});
  const [summary, setSummary] = useState(data.evaluation?.summary ?? "");
  const [summarySaved, setSummarySaved] = useState(data.evaluation?.summary ?? "");
  const [summaryState, setSummaryState] = useState<SaveState>("idle");

  // Saves run one after another: the first one may create the evaluation and
  // the next ones must reuse it.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const evalRef = useRef(evaluationId);
  const enqueue = useCallback(<T extends { evaluationId: string | null }>(fn: (id: string | null) => Promise<T>) => {
    const run = queue.current.catch(() => undefined).then(async () => {
      const res = await fn(evalRef.current);
      if (res.evaluationId && res.evaluationId !== evalRef.current) {
        evalRef.current = res.evaluationId;
        setEvaluationId(res.evaluationId);
      }
      return res;
    });
    queue.current = run;
    return run;
  }, []);

  const score = useMemo(
    () => evalScore({ tests: Object.keys(tests).filter((k) => tests[k as TestKey] != null) as TestKey[], body }),
    [tests, body],
  );
  const status = evalStatus(score.pct);

  const close = useCallback(() => router.push(closeHref, { scroll: false }), [router, closeHref]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName);
      if (e.key === "Escape") close();
      if (!typing && e.key === "ArrowRight" && nextHref) router.push(nextHref, { scroll: false });
      if (!typing && e.key === "ArrowLeft" && prevHref) router.push(prevHref, { scroll: false });
    }
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [close, nextHref, prevHref, router]);

  const saveTest = (key: TestKey) => async (value: number | null) => {
    await enqueue((id) => saveEvalTest({ memberId: member.id, evaluationId: id, from, to, test: key, value }));
    setTests((t) => {
      const next = { ...t };
      if (value == null) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const saveBody = (key: BodyMeta["key"]) => async (value: number | null) => {
    await enqueue((id) => saveEvalBodyField({ memberId: member.id, evaluationId: id, from, to, field: key, value }));
    setBody((b) => ({ ...b, [key]: value }));
  };

  async function commitSummary() {
    const current = summary;
    if (current.trim() === summarySaved.trim()) return;
    setSummaryState("saving");
    try {
      await enqueue((id) => saveEvalSummary({ memberId: member.id, evaluationId: id, from, to, summary: current }));
      setSummarySaved(current);
      setSummaryState("saved");
    } catch (e) {
      setSummaryState("error");
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  const isFitness = member.sede === "FITNESS_CENTER";

  const fatKg = body.weightKg && body.bodyFatPct ? (body.weightKg * body.bodyFatPct) / 100 : null;

  const testField = (t: TestMeta) => (
    <Field
      key={t.key}
      label={t.label}
      hint={t.hint}
      unit={TEST_LABELS[t.key].unit}
      isTime={t.isTime}
      initial={data.tests[t.key] ?? null}
      prev={data.previous.tests[t.key]}
      betterDir={TEST_LABELS[t.key].betterDir}
      derived={t.derived}
      disabled={!canEditTests || !member.active}
      onSave={saveTest(t.key)}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/40 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label={`Evaluación de ${member.name}`} className="my-auto w-full max-w-7xl rounded-2xl bg-[#f6f4ef] shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-t-2xl border-b border-stone-200 bg-white px-5 py-4">
          <ScoreRing pct={score.pct} />
          <div className="min-w-0 flex-1 basis-56">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{member.name}</h2>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {isFitness ? "Fitness Center" : "Xtreme"}
              {member.level && ` · ${LEVEL_LABELS[member.level] ?? member.level}`}
              {" · "}
              {data.evaluation
                ? `${TYPE_LABELS[data.evaluation.type]} desde el ${shortDate(data.evaluation.startedAt)}`
                : evaluationId
                  ? "Evaluación nueva"
                  : "Sin evaluación en curso: se crea con el primer dato"}
            </p>
            <p className="text-xs text-muted-foreground">
              {score.pct >= EVAL_COMPLETE_PCT
                ? "Evaluación completa. Puedes seguir sumando tests."
                : `Le falta ${EVAL_COMPLETE_PCT - score.pct}% para quedar evaluado. Cada dato se guarda solo al salir del campo.`}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Link href={`/dashboard/socios/${member.id}`} className="rounded-full border border-stone-200 px-3 py-1.5 text-xs font-medium hover:border-stone-400">Ficha</Link>
            {prevHref ? (
              <Link href={prevHref} scroll={false} title="Anterior (←)" className="rounded-full border border-stone-200 p-1.5 hover:border-stone-400"><ArrowLeft className="size-4" /></Link>
            ) : <span className="rounded-full border border-stone-100 p-1.5 text-stone-300"><ArrowLeft className="size-4" /></span>}
            {nextHref ? (
              <Link href={nextHref} scroll={false} title="Siguiente (→)" className="rounded-full border border-stone-200 p-1.5 hover:border-stone-400"><ArrowRight className="size-4" /></Link>
            ) : <span className="rounded-full border border-stone-100 p-1.5 text-stone-300"><ArrowRight className="size-4" /></span>}
            <button type="button" onClick={close} title="Cerrar (Esc)" className="ml-1 rounded-full bg-stone-900 p-1.5 text-white hover:bg-stone-700"><X className="size-4" /></button>
          </div>
        </div>

        {!member.active && (
          <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            Socio sin membresía activa: no se pueden registrar tests. Reactívalo desde su ficha.
          </div>
        )}

        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-3">
          {/* Column 1: body + what counts */}
          <div className="min-w-0 space-y-4">
            <Column title="Composición corporal" icon={Scale} color="#0f9f8f" aside="20% del avance">
              {BODY.map((b) => (
                <Field
                  key={b.key}
                  label={b.label}
                  unit={b.unit}
                  step={b.step}
                  initial={data.body?.[b.key] ?? null}
                  prev={data.previous.body?.[b.key] != null ? { value: data.previous.body[b.key]!, at: data.previous.body.at } : undefined}
                  betterDir={b.betterDir}
                  disabled={!canEditBody || !member.active}
                  onSave={saveBody(b.key)}
                />
              ))}
              {fatKg != null && (
                <p className="py-2.5 text-xs font-medium text-[#3a8fd1]">Masa grasa estimada: {fatKg.toFixed(1)} kg</p>
              )}
            </Column>

            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-600">Qué cuenta para el avance</h3>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {score.slots.map((s) => (
                  <li key={s.key} className={`flex items-center justify-between gap-2 ${s.done ? "" : "text-muted-foreground"}`}>
                    <span className="flex items-center gap-1.5 truncate">
                      <span className={`flex size-3.5 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-emerald-600 text-white" : "border border-stone-300"}`}>
                        {s.done && <Check className="size-2.5" strokeWidth={3} />}
                      </span>
                      <span className="truncate">{s.label}</span>
                    </span>
                    <span className="tabular-nums">{s.weight}%</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">Con {EVAL_COMPLETE_PCT}% queda evaluado. El salto largo y los levantamientos olímpicos no suman.</p>
            </section>
          </div>

          {/* Column 2: strength */}
          <Column title="Fuerza" icon={Dumbbell} color="#3a8fd1" aside="50% del avance">
            {STRENGTH.map(testField)}
          </Column>

          {/* Column 3: conditioning, olympic lifts, notes, history */}
          <div className="min-w-0 space-y-4">
            <Column title="Acondicionamiento" icon={HeartPulse} color="#e5533f" aside="30% del avance">
              {CONDITIONING.map(testField)}
            </Column>

            <Column title="Potencia" icon={Activity} color="#d19a3a" aside="No suma · bajo impacto: vacío">
              {POWER.map(testField)}
            </Column>

            <Column title="Levantamientos olímpicos" icon={Activity} color="#7c6bd6" aside="Opcional, no suma">
              {OLYMPIC.map(testField)}
            </Column>

            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-stone-600">Observaciones del coach</h3>
                <SaveMark state={summaryState} />
              </div>
              <textarea
                value={summary}
                disabled={!canEditTests || !member.active}
                onChange={(e) => { setSummary(e.target.value); setSummaryState("idle"); }}
                onBlur={commitSummary}
                rows={3}
                placeholder="Técnica, molestias, qué trabajar este ciclo…"
                className="w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
              />
            </section>

            {data.history.length > 0 && (
              <section className="rounded-xl border border-stone-200 bg-white p-4">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-600">Evaluaciones anteriores</h3>
                <ul className="space-y-1.5 text-sm">
                  {data.history.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-2">
                      <span>{TYPE_LABELS[h.type]} <span className="text-xs text-muted-foreground">· {shortDate(h.startedAt)}</span></span>
                      <span className="text-xs font-medium tabular-nums" style={{ color: STATUS_COLOR[evalStatus(h.pct)] }}>{h.pct}%</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
