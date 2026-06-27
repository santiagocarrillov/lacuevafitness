import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import { CapsuleCard } from "@/components/portal/capsule-card";
import { portalSignOut } from "@/lib/actions/portal-auth";
import { daysBetween, money, shortDate } from "@/lib/portal/format";

export const dynamic = "force-dynamic";

export default async function CuentaPage() {
  const { member } = await requireMember();

  const [activeMembership, paymentCount, attendanceCount, evalCount] = await Promise.all([
    prisma.membership.findFirst({
      where: { memberId: member.id, state: "ACTIVE" },
      orderBy: { endsAt: "desc" },
      include: { plan: true },
    }),
    prisma.payment.count({ where: { memberId: member.id } }),
    prisma.attendance.count({ where: { memberId: member.id } }),
    prisma.evaluation.count({ where: { memberId: member.id } }),
  ]);

  const initial = member.firstName.charAt(0).toUpperCase();
  const renewDays = activeMembership
    ? daysBetween(new Date(), activeMembership.endsAt)
    : null;
  const planPrice = activeMembership
    ? money(
        activeMembership.customPriceCents ?? activeMembership.plan.priceCents,
        activeMembership.plan.currency,
      )
    : null;

  return (
    <PortalShell avatarInitial={initial}>
      <div style={{ marginBottom: 18 }}>
        <div className="portal-kicker">
          {member.firstName} {member.lastName} · Socio desde {shortDate(member.joinedAt)}
        </div>
        <h2 className="portal-title">
          Mi <em>cuenta</em>
        </h2>
      </div>

      {activeMembership ? (
        <div className="portal-membership">
          <div className="plan-label">Membresía activa</div>
          <div className="plan-name">{activeMembership.plan.name}</div>
          <div className="plan-row">
            <div className="plan-item">
              <div className="k">Plan</div>
              <div className="v">{planPrice}</div>
            </div>
            <div className="plan-item">
              <div className="k">Vence</div>
              <div className="v">{shortDate(activeMembership.endsAt)}</div>
            </div>
            <div className="plan-item days">
              <div className="k">Renueva en</div>
              <div className="v">{Math.max(renewDays ?? 0, 0)} días</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="portal-card" style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 13, color: "var(--pt-ink-2)" }}>
            No tienes una membresía activa. Habla con tu admin para reactivarla.
          </p>
        </div>
      )}

      <div className="portal-section-title">
        <h4>Nutrición</h4>
      </div>

      <Link href="/portal/nutricion" className="portal-list-item">
        <div className="li-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 3v18" />
            <path d="M5 8c0-2 1.5-3 3.5-3S12 6 12 8" />
            <path d="M19 5c0 4-2 6-4 6" />
          </svg>
        </div>
        <div className="info">
          <div className="t">Mi plan nutricional</div>
          <div className="s">Plan alimenticio y seguimiento</div>
        </div>
        <div className="arrow">→</div>
      </Link>

      <div className="portal-section-title">
        <h4>Historial</h4>
      </div>

      <Link href="/portal/cuenta/pagos" className="portal-list-item">
        <div className="li-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 10h18" />
          </svg>
        </div>
        <div className="info">
          <div className="t">Comprobantes de pago</div>
          <div className="s">{paymentCount} pagos registrados</div>
        </div>
        <div className="arrow">→</div>
      </Link>

      <Link href="/portal/cuenta/asistencias" className="portal-list-item">
        <div className="li-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 8v4l3 2" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>
        <div className="info">
          <div className="t">Asistencias</div>
          <div className="s">{attendanceCount} visitas en total</div>
        </div>
        <div className="arrow">→</div>
      </Link>

      <Link href="/portal/cuenta/evaluaciones" className="portal-list-item">
        <div className="li-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 12h4l3-8 4 16 3-8h4" />
          </svg>
        </div>
        <div className="info">
          <div className="t">Historial de evaluaciones</div>
          <div className="s">{evalCount} evaluaciones SRXFit</div>
        </div>
        <div className="arrow">→</div>
      </Link>

      <div className="portal-section-title">
        <h4>Aprende SRXFit</h4>
      </div>
      <CapsuleCard />

      <form action={portalSignOut} style={{ marginTop: 28 }}>
        <button
          type="submit"
          style={{
            width: "100%",
            padding: "11px 12px",
            background: "transparent",
            color: "var(--pt-ink-3)",
            border: "1px solid var(--pt-line)",
            borderRadius: 10,
            fontSize: 12,
            fontFamily: "var(--pt-font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            cursor: "pointer",
          }}
        >
          Cerrar sesión
        </button>
      </form>
    </PortalShell>
  );
}
