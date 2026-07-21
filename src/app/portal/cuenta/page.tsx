import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import { CapsuleCard } from "@/components/portal/capsule-card";
import { portalSignOut } from "@/lib/actions/portal-auth";
import { NotificationsToggle } from "@/components/portal/notifications-toggle";
import { daysBetween, money, shortDate } from "@/lib/portal/format";

export const dynamic = "force-dynamic";

export default async function CuentaPage() {
  const { member } = await requireMember();

  const [activeMembership, paymentCount, attendanceCount] = await Promise.all([
    prisma.membership.findFirst({
      where: { memberId: member.id, state: "ACTIVE" },
      orderBy: { endsAt: "desc" },
      include: { plan: true },
    }),
    prisma.payment.count({ where: { memberId: member.id } }),
    prisma.attendance.count({ where: { memberId: member.id } }),
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

      {member.sex === "FEMALE" && (
        <>
          <div className="portal-section-title">
            <h4>Bienestar</h4>
          </div>
          <Link href="/portal/cuenta/ciclo" className="portal-list-item">
            <div className="li-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 22c4-2 6-6 6-11a6 6 0 00-12 0c0 5 2 9 6 11z" />
                <circle cx="12" cy="11" r="2.2" />
              </svg>
            </div>
            <div className="info">
              <div className="t">Mi ciclo</div>
              <div className="s">Registra tu período y ajusta tu entrenamiento</div>
            </div>
            <div className="arrow">→</div>
          </Link>
        </>
      )}

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

      <div className="portal-section-title">
        <h4>Ajustes</h4>
      </div>
      <NotificationsToggle />

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
