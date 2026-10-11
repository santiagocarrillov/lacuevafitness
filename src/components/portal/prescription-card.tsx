import type { Prescription } from "@/lib/srxfit/prescription";

const STEP_COLOR: Record<Prescription["step"], string> = {
  half: "#16a34a",
  down: "#d97706",
  base: "var(--pt-ink-3)",
  up: "#2563eb",
};

// The day's station adjustment for this socio (Manual SRXFIT v3, 8.4). The
// class base stays the coach's call; this is the suggestion next to it.
export function PrescriptionCard({ prescription }: { prescription: Prescription }) {
  const p = prescription;
  return (
    <section className="portal-card" style={{ marginBottom: 14, borderLeft: `3px solid ${STEP_COLOR[p.step]}` }}>
      <div className="portal-kicker">Tu prescripción de hoy · estaciones</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{p.headline}</div>
      <p style={{ fontSize: 13, color: "var(--pt-ink-2)", lineHeight: 1.5, margin: "4px 0 0" }}>{p.detail}</p>

      {p.reasons.length > 0 && (
        <ul style={listStyle}>
          {p.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {p.priorities.length > 0 && (
        <>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--pt-ink-3)", marginTop: 12 }}>
            Tus prioridades
          </div>
          <ul style={listStyle}>
            {p.priorities.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      )}

      <p style={{ fontSize: 11.5, color: "var(--pt-ink-3)", lineHeight: 1.5, margin: "10px 0 0" }}>
        El ejercicio principal es igual para toda la clase: lo tuyo ahí es la carga. Si te duele algo, avisa: tu coach
        puede cambiar esta sugerencia.
      </p>
    </section>
  );
}

const listStyle: React.CSSProperties = {
  margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--pt-ink-2)", lineHeight: 1.55,
};
