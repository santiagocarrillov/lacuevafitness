"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logSelfMeasurement, logSelfPr } from "@/lib/actions/self-log";
import { SELF_LOGGABLE_TESTS } from "@/lib/portal/self-log-tests";

type Tab = null | "medidas" | "pr";

// Lets the socio log their own weigh-in / measurements and lift PRs. Entries are
// theirs immediately; a coach validates them later (see EntrySource).
export function SelfLog() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, fd: FormData) {
    setBusy(true);
    setMsg(null);
    const res = await action(fd);
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error ?? "No se pudo guardar." });
      return;
    }
    setMsg({ ok: true, text: "Guardado. Tu coach lo revisará." });
    setTab(null);
    router.refresh();
  }

  return (
    <div className="portal-card" style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Registra lo tuyo</div>
      <p style={{ fontSize: 12.5, color: "var(--pt-ink-2)", lineHeight: 1.5, marginBottom: 12 }}>
        Anota tu peso, medidas o una marca nueva. Se guarda al instante y tu coach
        lo valida después.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => { setTab(tab === "medidas" ? null : "medidas"); setMsg(null); }} style={pill(tab === "medidas")}>
          Peso y medidas
        </button>
        <button type="button" onClick={() => { setTab(tab === "pr" ? null : "pr"); setMsg(null); }} style={pill(tab === "pr")}>
          Nueva marca (PR)
        </button>
      </div>

      {tab === "medidas" && (
        <form action={(fd) => submit(logSelfMeasurement, fd)} style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <Field name="weightKg" label="Peso (kg)" placeholder="Ej. 74.5" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field name="waistCm" label="Cintura (cm)" />
            <Field name="hipCm" label="Cadera (cm)" />
            <Field name="chestCm" label="Pecho (cm)" />
            <Field name="armCm" label="Brazo (cm)" />
          </div>
          <Field name="thighCm" label="Muslo (cm)" />
          <Field name="notes" label="Nota (opcional)" type="text" placeholder="Ej. en ayunas" />
          <button type="submit" disabled={busy} style={primaryBtn}>
            {busy ? "Guardando…" : "Guardar medidas"}
          </button>
        </form>
      )}

      {tab === "pr" && (
        <form action={(fd) => submit(logSelfPr, fd)} style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <label style={labelStyle}>
            Ejercicio
            <select name="test" required defaultValue="" style={inputStyle}>
              <option value="" disabled>Elige un ejercicio</option>
              {SELF_LOGGABLE_TESTS.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </label>
          <Field name="value" label="Marca" placeholder="Ej. 100" />
          <Field name="notes" label="Nota (opcional)" type="text" />
          <button type="submit" disabled={busy} style={primaryBtn}>
            {busy ? "Guardando…" : "Guardar marca"}
          </button>
        </form>
      )}

      {msg && (
        <p style={{ marginTop: 10, fontSize: 12.5, color: msg.ok ? "var(--pt-green)" : "var(--pt-red)" }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

function Field({ name, label, placeholder, type = "number" }: {
  name: string; label: string; placeholder?: string; type?: string;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <input
        name={name}
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        step="any"
        placeholder={placeholder}
        style={inputStyle}
      />
    </label>
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

function pill(active: boolean): React.CSSProperties {
  return {
    padding: "8px 13px", borderRadius: 999,
    border: active ? "none" : "1px solid var(--pt-line)",
    background: active ? "var(--pt-ink)" : "transparent",
    color: active ? "#fff" : "var(--pt-ink-2)",
    fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  };
}
