"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logPeriodStart, setPeriodEnd, deletePeriod } from "@/lib/actions/cycle";

type Period = { id: string; startDate: string; endDate: string | null };

const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "var(--pt-ink)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const dateInput: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid var(--pt-line)",
  background: "var(--pt-bg-card)",
  color: "var(--pt-ink)",
  fontSize: 13,
  fontFamily: "inherit",
};

export function CycleTracker({
  periods,
  todayISO,
  predictedNextISO,
}: {
  periods: Period[];
  todayISO: string;
  predictedNextISO: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [startVal, setStartVal] = useState(todayISO);
  const [endDrafts, setEndDrafts] = useState<Record<string, string>>({});

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch {
        // no-op: surfaced via lack of refresh
      }
    });
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Log a start */}
      <section className="portal-card">
        <div className="portal-kicker">Registrar período</div>
        <div style={{ fontSize: 13, color: "var(--pt-ink-2)", marginTop: 4 }}>
          ¿Cuándo empezó tu período?
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input
            type="date"
            value={startVal}
            max={todayISO}
            onChange={(e) => setStartVal(e.target.value)}
            style={dateInput}
          />
          <button
            type="button"
            disabled={isPending || !startVal}
            onClick={() => run(() => logPeriodStart(startVal))}
            style={{ ...btn, opacity: isPending ? 0.6 : 1 }}
          >
            Registrar inicio
          </button>
        </div>
        {predictedNextISO && (
          <div style={{ fontSize: 12, color: "var(--pt-ink-3)", marginTop: 10 }}>
            Próximo período estimado: <strong>{fmt(predictedNextISO)}</strong>
          </div>
        )}
      </section>

      {/* History */}
      {periods.length > 0 && (
        <section className="portal-card">
          <div className="portal-kicker">Historial</div>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {periods.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  paddingBottom: 10,
                  borderBottom: "1px solid var(--pt-line)",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{fmt(p.startDate)}</div>
                  <div style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
                    {p.endDate ? `Terminó ${fmt(p.endDate)}` : "En curso / sin fin registrado"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {!p.endDate && (
                    <>
                      <input
                        type="date"
                        min={p.startDate}
                        max={todayISO}
                        value={endDrafts[p.id] ?? ""}
                        onChange={(e) =>
                          setEndDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                        }
                        style={{ ...dateInput, padding: "6px 8px", fontSize: 12 }}
                      />
                      <button
                        type="button"
                        disabled={isPending || !endDrafts[p.id]}
                        onClick={() => run(() => setPeriodEnd(p.id, endDrafts[p.id]))}
                        style={{
                          ...btn,
                          padding: "6px 10px",
                          fontSize: 12,
                          opacity: !endDrafts[p.id] ? 0.5 : 1,
                        }}
                      >
                        Marcar fin
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => deletePeriod(p.id))}
                    aria-label="Eliminar"
                    style={{
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: "1px solid var(--pt-line)",
                      background: "transparent",
                      color: "var(--pt-ink-3)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
