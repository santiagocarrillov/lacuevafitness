"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSelfEntry, logMainSet } from "@/lib/actions/self-log";
import { estimate1Rm, formatMainSet, MAIN_SET_LIMITS, type MainSet } from "@/lib/self-log/main-set";

export type MainSetToday = MainSet & { id: string; exercise: string; verified: boolean };
export type MainSetPrevious = MainSet & { exercise: string; when: string };

const RIR_OPTIONS = [
  { value: 0, label: "0 · no salía otra" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5 o más" },
];

// The socio logs the best set of today's main lift right after the strength
// block (Manual SRXFIT v3, 9.5). Theirs immediately; a coach validates later.
export function MainSetCard({
  suggestedExercise,
  today,
  previous,
}: {
  suggestedExercise: string | null;
  today: MainSetToday | null;
  previous: MainSetPrevious | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(fd: FormData) {
    setBusy(true);
    setError(null);
    const res = await logMainSet(fd);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!today) return;
    setBusy(true);
    setError(null);
    const res = await deleteSelfEntry("set", today.id);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  const showForm = !today || editing;

  return (
    <section className="portal-card" style={{ marginBottom: 14 }}>
      <div className="portal-kicker">Tu serie principal de hoy</div>

      {today && !editing && (
        <>
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{today.exercise}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {formatMainSet(today)}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--pt-ink-3)", marginTop: 4 }}>
            1RM estimado {estimate1Rm(today)} kg ·{" "}
            <span style={{ color: today.verified ? "var(--pt-green)" : "var(--pt-ink-3)" }}>
              {today.verified ? "validado por tu coach" : "tu coach lo valida después"}
            </span>
          </div>
          {!today.verified && (
            <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
              <button type="button" onClick={() => setEditing(true)} disabled={busy} style={linkBtn}>
                Corregir
              </button>
              <button type="button" onClick={remove} disabled={busy} style={{ ...linkBtn, color: "var(--pt-red)" }}>
                Borrar
              </button>
            </div>
          )}
        </>
      )}

      {showForm && (
        <>
          <p style={{ fontSize: 12.5, color: "var(--pt-ink-2)", lineHeight: 1.5, margin: "4px 0 10px" }}>
            Al terminar el bloque de Fuerza, anota tu mejor serie del ejercicio principal.
            {previous && (
              <>
                {" "}
                La última vez ({previous.when}): <strong>{formatMainSet(previous)}</strong>.
              </>
            )}
          </p>
          <form action={save} style={{ display: "grid", gap: 10 }}>
            <label style={labelStyle}>
              Ejercicio principal
              <input
                name="exercise"
                type="text"
                required
                maxLength={80}
                defaultValue={today?.exercise ?? suggestedExercise ?? ""}
                placeholder="Ej. Front squat"
                style={inputStyle}
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={labelStyle}>
                Carga (kg)
                <input
                  name="loadKg"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={MAIN_SET_LIMITS.loadKg[0]}
                  max={MAIN_SET_LIMITS.loadKg[1]}
                  required
                  defaultValue={today?.loadKg}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Repeticiones
                <input
                  name="reps"
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={MAIN_SET_LIMITS.reps[0]}
                  max={MAIN_SET_LIMITS.reps[1]}
                  required
                  defaultValue={today?.reps}
                  style={inputStyle}
                />
              </label>
            </div>
            <label style={labelStyle}>
              ¿Cuántas más te quedaban?
              <select name="rir" required defaultValue={today ? String(Math.min(today.rir, 5)) : ""} style={inputStyle}>
                <option value="" disabled>
                  Repeticiones en reserva
                </option>
                {RIR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={busy} style={{ ...primaryBtn, flex: 1 }}>
                {busy ? "Guardando…" : "Guardar mi serie"}
              </button>
              {editing && (
                <button type="button" onClick={() => setEditing(false)} disabled={busy} style={ghostBtn}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </>
      )}

      {error && <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--pt-red)" }}>{error}</p>}
    </section>
  );
}

const labelStyle: React.CSSProperties = {
  display: "grid", gap: 5, fontSize: 11, textTransform: "uppercase",
  letterSpacing: "0.1em", color: "var(--pt-ink-3)",
  fontFamily: "var(--pt-font-cond)",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid var(--pt-line)", background: "var(--pt-bg-card-alt)",
  fontSize: 14, color: "var(--pt-ink)", textTransform: "none", letterSpacing: 0,
  fontFamily: "var(--pt-font-sans)",
};

const primaryBtn: React.CSSProperties = {
  padding: "11px 12px", borderRadius: 10, border: "none",
  background: "var(--pt-ink)", color: "#fff", fontSize: 13,
  fontWeight: 600, cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  padding: "11px 14px", borderRadius: 10, border: "1px solid var(--pt-line)",
  background: "transparent", color: "var(--pt-ink-2)", fontSize: 13,
  fontWeight: 600, cursor: "pointer",
};

const linkBtn: React.CSSProperties = {
  padding: 0, border: "none", background: "none", fontSize: 12.5,
  color: "var(--pt-ink-2)", textDecoration: "underline", textUnderlineOffset: 3,
  cursor: "pointer",
};
