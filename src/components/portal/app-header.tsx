import Link from "next/link";

export function AppHeader({ avatarInitial }: { avatarInitial: string }) {
  return (
    <header className="portal-app-header">
      <div className="portal-brand">
        <div className="portal-brand-bolt" />
        <div className="portal-brand-name">
          La Cueva <em>Socio</em>
        </div>
      </div>
      <Link href="/portal/cuenta" className="portal-avatar" aria-label="Mi cuenta">
        {avatarInitial}
      </Link>
    </header>
  );
}
