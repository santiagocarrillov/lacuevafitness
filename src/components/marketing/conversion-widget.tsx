"use client";

import { useState } from "react";

/**
 * Placeholder del widget persistente de conversión.
 * El cableado real (chat IA + WhatsApp) vive en `src/lib/whatsapp/` y se conecta
 * en la sesión que está construyendo ese flujo. Aquí solo queda la superficie.
 */
const OPTIONS = [
  { ic: "✦", title: "Chat con IA", sub: "Respuestas al instante" },
  { ic: "◉", title: "WhatsApp", sub: "Escríbenos directo" },
  { ic: "☎", title: "Llamada", sub: "Te llamamos" },
  { ic: "✎", title: "Déjanos tus datos", sub: "Formulario rápido" },
] as const;

export function ConversionWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="widget">
      <div className={`widget-panel${open ? " open" : ""}`} hidden={!open}>
        <div className="wt">¿Hablamos? Elige cómo</div>
        {OPTIONS.map((o) => (
          <button className="widget-opt" key={o.title} type="button">
            <span className="ic" aria-hidden="true">
              {o.ic}
            </span>
            <span>
              <b>{o.title}</b>
              <br />
              <span>{o.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <button
        className="fab"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Cerrar contacto" : "Abrir contacto"}
      >
        {open ? "×" : "✦"}
      </button>
    </div>
  );
}
