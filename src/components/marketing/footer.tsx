import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="footer">
      <div>
        © {new Date().getFullYear()} La Cueva · SRXFIT
        <br />
        Sangolquí / Quito, Ecuador
        <div className="gradbar" />
      </div>
      <div>
        Fitness Center · Xtreme
        <br />
        <Link href="/login">Ingresar a la app</Link>
      </div>
    </footer>
  );
}
