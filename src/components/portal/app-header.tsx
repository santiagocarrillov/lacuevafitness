import Link from "next/link";

export function AppHeader({
  avatarInitial,
  isStaff,
}: {
  avatarInitial: string;
  isStaff?: boolean;
}) {
  return (
    <header className="portal-app-header">
      <div className="portal-brand">
        <span className="portal-wordmark">La Cueva</span>
        <span className="portal-brand-tag">Socio</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {isStaff && (
          <Link
            href="/dashboard"
            className="portal-staff-back"
            aria-label="Volver al panel de administración"
          >
            ← Panel
          </Link>
        )}
        <Link href="/portal/cuenta" className="portal-avatar" aria-label="Mi cuenta">
          {avatarInitial}
        </Link>
      </div>
    </header>
  );
}
