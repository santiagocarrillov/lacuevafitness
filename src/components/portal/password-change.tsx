"use client";

import { useState } from "react";
import { portalSetPassword } from "@/lib/actions/portal-auth";

// Lets a socio set their own password from inside the app. Collapsed by default;
// expands into a short form. Works whether they signed up with a password or
// only ever used a magic link.
export function PasswordChange() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSubmit(formData: FormData) {
    setBusy(true);
    setMsg(null);
    const res = await portalSetPassword(formData);
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setMsg({ ok: true, text: "Contraseña actualizada." });
    setOpen(false);
  }

  return (
    <div className="portal-card" style={{ marginBottom: 6 }}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setMsg(null);
        }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
          color: "var(--pt-ink)",
        }}
      >
        <div className="li-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 018 0v3" />
          </svg>
        </div>
        <div className="info" style={{ flex: 1 }}>
          <div className="t">Contraseña</div>
          <div className="s">Crea o cambia tu contraseña</div>
        </div>
        <div className="arrow">{open ? "▾" : "→"}</div>
      </button>

      {open && (
        <form action={handleSubmit} style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            placeholder="Nueva contraseña (mín. 8)"
            style={fieldStyle}
          />
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            placeholder="Repite la contraseña"
            style={fieldStyle}
          />
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: "10px 12px",
              borderRadius: 9,
              border: "none",
              background: "var(--pt-ink)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {busy ? "Guardando…" : "Guardar contraseña"}
          </button>
        </form>
      )}

      {msg && (
        <p
          style={{
            marginTop: 10,
            fontSize: 12.5,
            color: msg.ok ? "var(--pt-green)" : "var(--pt-red)",
          }}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--pt-line)",
  background: "var(--pt-bg-card-alt)",
  fontSize: 14,
  color: "var(--pt-ink)",
};
