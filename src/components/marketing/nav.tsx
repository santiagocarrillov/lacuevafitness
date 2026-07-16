import Image from "next/image";
import Link from "next/link";

export function MarketingNav() {
  return (
    <nav className="nav">
      <Link href="/" aria-label="La Cueva SRXFIT — inicio">
        {/* Se muestra a 52px de alto (~79px de ancho). Declaramos 2x para retina:
            con width={1200} next/image servía una imagen de 1200px para un logo de 70px. */}
        <Image
          src="/img/logo-lacueva-srxfit.png"
          alt="La Cueva SRXFIT"
          width={158}
          height={104}
          className="nav-logo"
          priority
        />
      </Link>
      <div className="nav-links">
        <a className="plain" href="#metodo">
          El Método
        </a>
        <a className="plain" href="#sedes">
          Sedes
        </a>
        <a className="plain" href="#cierre">
          Precios
        </a>
        {/* La app vive en el mismo proyecto: /login es una ruta interna, no un dominio aparte. */}
        <Link className="plain" href="/login">
          Ingresar
        </Link>
        <a className="btn btn-solid" href="#cierre">
          Empieza el Test
        </a>
      </div>
    </nav>
  );
}
