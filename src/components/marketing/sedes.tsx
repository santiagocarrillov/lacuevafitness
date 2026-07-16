import Image from "next/image";

/**
 * En las DOS sedes se entrena SRXFIT. Los rótulos "CrossFit" / "Funcional" están
 * obsoletos: las sedes se diferencian por espacio y ubicación, no por método.
 */
const SEDES = [
  {
    k: "Sede 01",
    name: "Fitness Center",
    text: "Nuestra casa original. Espacio techado, mezzanine y área de fuerza completa.",
    img: "/img/sede-fitness-center.jpg",
    width: 1420,
    height: 664,
    position: "center 42%",
  },
  {
    k: "Sede 02",
    name: "Xtreme",
    text: "La nave abovedada en medio del verde. Abierta, amplia, rodeada de naturaleza.",
    img: "/img/sede-xtreme.jpg",
    width: 1200,
    height: 512,
    position: "center",
  },
] as const;

export function Sedes() {
  return (
    <section className="sedes" id="sedes">
      <p className="eyebrow">Dos cuevas, un método</p>
      <h2>Elige tu sede.</h2>
      <p className="sub">
        En las dos se entrena SRXFIT — el mismo método, la misma prescripción, la misma medición.
        Elige por cercanía y por el espacio donde quieras entrenar.
      </p>
      <div className="sede-grid">
        {SEDES.map((s) => (
          <article className="sede" key={s.k}>
            <Image
              src={s.img}
              alt={`La Cueva ${s.name}`}
              fill
              sizes="(max-width: 820px) 100vw, 1300px"
              style={{ objectPosition: s.position }}
            />
            <div className="sede-info">
              <div className="k">{s.k}</div>
              <h3>{s.name}</h3>
              <p>{s.text}</p>
              <div className="sede-tags">
                <span>Método SRXFIT</span>
                <span>Evaluación completa</span>
                <span>Sangolquí</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
