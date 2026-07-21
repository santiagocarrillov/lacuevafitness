import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import { ecuadorParts } from "@/lib/portal/tz";
import { computeCycleState, PHASE_META } from "@/lib/portal/cycle";
import { CycleTracker } from "@/components/portal/cycle-tracker";

export const dynamic = "force-dynamic";

export default async function CicloPage() {
  const { member } = await requireMember();
  // Section is women-only.
  if (member.sex !== "FEMALE") redirect("/portal/cuenta");

  const periods = await prisma.menstrualPeriod.findMany({
    where: { memberId: member.id },
    orderBy: { startDate: "desc" },
    take: 24,
  });

  const { year, month, day } = ecuadorParts(new Date());
  const todayUtc = new Date(Date.UTC(year, month - 1, day));
  const state = computeCycleState(
    periods.map((p) => ({ startDate: p.startDate, endDate: p.endDate })),
    todayUtc,
  );

  const initial = member.firstName.charAt(0).toUpperCase();
  const phaseMeta = state.known ? PHASE_META[state.phase] : null;

  return (
    <PortalShell avatarInitial={initial}>
      <Link
        href="/portal/cuenta"
        style={{ fontSize: 11, color: "var(--pt-ink-3)", textDecoration: "none" }}
      >
        ← Mi cuenta
      </Link>
      <div style={{ margin: "12px 0 18px" }}>
        <div className="portal-kicker">Bienestar</div>
        <h2 className="portal-title">
          Mi <em>ciclo</em>
        </h2>
      </div>

      {/* Fase actual */}
      {state.known && phaseMeta ? (
        <section
          className="portal-card"
          style={{ marginBottom: 14, borderLeft: `3px solid ${phaseMeta.color}` }}
        >
          {state.overdue ? (
            <>
              <div className="portal-kicker">Ciclo</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>
                Tu período podría estar atrasado
              </div>
              <div style={{ fontSize: 13, color: "var(--pt-ink-2)", marginTop: 4 }}>
                Han pasado {state.cycleDay} días desde tu último inicio (ciclo estimado{" "}
                {state.cycleLength} días). Si ya te llegó, regístralo abajo.
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: phaseMeta.color,
                  }}
                />
                <span style={{ fontSize: 16, fontWeight: 700 }}>Fase {phaseMeta.label}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--pt-ink-3)", marginTop: 4 }}>
                Día {state.cycleDay} de tu ciclo · ciclo estimado {state.cycleLength} días
              </div>
              <div style={{ fontSize: 14, color: "var(--pt-ink-1)", marginTop: 10, lineHeight: 1.5 }}>
                {phaseMeta.training}
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="portal-card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, color: "var(--pt-ink-1)" }}>
            Registra el inicio de tu período para estimar tu fase del ciclo y recibir sugerencias de
            entrenamiento.
          </div>
        </section>
      )}

      <CycleTracker
        periods={periods.map((p) => ({
          id: p.id,
          startDate: p.startDate.toISOString().slice(0, 10),
          endDate: p.endDate ? p.endDate.toISOString().slice(0, 10) : null,
        }))}
        todayISO={todayUtc.toISOString().slice(0, 10)}
        predictedNextISO={state.known ? state.predictedNextISO : null}
      />

      <p style={{ fontSize: 11, color: "var(--pt-ink-3)", marginTop: 16, lineHeight: 1.5 }}>
        Esta estimación es orientativa para tu entrenamiento y no reemplaza consejo médico. Tus
        registros son privados.
      </p>
    </PortalShell>
  );
}
