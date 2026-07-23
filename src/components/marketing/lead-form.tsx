"use client";

import { useState } from "react";
import Link from "next/link";
import { submitWebLead } from "@/lib/actions/web-lead";
import { BRANCH_OPTIONS } from "@/lib/leads/web-form";

export function LeadForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(formData: FormData) {
    setBusy(true);
    setError(null);
    const res = await submitWebLead(formData);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="lead-card lead-done">
        <h2>¡Listo!</h2>
        <p>
          Recibimos tus datos. Enseguida te contactamos para agendar tu
          evaluación.
        </p>
        <Link className="btn btn-ghost" href="/">
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <div className="lead-card">
      <h1>Empieza tu transformación</h1>
      <p className="lead-intro">
        ¡Gracias por tu interés en empezar! Llena el siguiente formulario y
        enseguida te contactamos.
      </p>

      <form action={handleSubmit} noValidate>
        <div className="lead-row">
          <label>
            Nombre
            <input name="firstName" type="text" autoComplete="given-name" required />
          </label>
          <label>
            Apellido
            <input name="lastName" type="text" autoComplete="family-name" required />
          </label>
        </div>

        <label>
          Teléfono
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" required />
        </label>

        <label>
          Correo
          <input name="email" type="email" inputMode="email" autoComplete="email" required />
        </label>

        <label>
          Sucursal
          <select name="branch" required defaultValue="">
            <option value="" disabled>
              Elige una sucursal
            </option>
            {BRANCH_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>

        {/* Honeypot — oculto para personas, tentador para bots. */}
        <input
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="lead-hp"
        />

        {error && <p className="lead-error">{error}</p>}

        <button type="submit" className="btn btn-solid lead-submit" disabled={busy}>
          {busy ? "Enviando…" : "Enviar"}
        </button>
      </form>
    </div>
  );
}
