import Link from "next/link";
import Image from "next/image";

const C = 220; // centro del viewBox 440x440

function pt(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}

/** 60 marcas cada 6°; la de las 12 en punto es mayor (referencia del dial). */
const TICKS = Array.from({ length: 60 }, (_, i) => {
  const deg = i * 6;
  const major = i === 0;
  const p1 = pt(major ? 196 : 193, deg);
  const p2 = pt(major ? 187 : 189, deg);
  return { p1, p2, major, deg };
});

/** 5 nodos = las 5 etapas del ciclo, cada 72°, con su color de zona. */
const NODE_COLORS = ["#6B4FB5", "#3A8FD1", "#00D4C4", "#C9F543", "#FF6B5A"];
const NODES = NODE_COLORS.map((color, i) => ({ color, ...pt(190, i * 72) }));

const CYCLE_TEXT =
  "EVALUACIÓN · PRESCRIPCIÓN · EJECUCIÓN · SEGUIMIENTO · REEVALUACIÓN · EVALUACIÓN · PRESCRIPCIÓN · EJECUCIÓN · SEGUIMIENTO · REEVALUACIÓN ·";

export function Closing() {
  return (
    <section className="closing" id="cierre">
      <Image src="/img/cueva-aerea.jpg" alt="La Cueva desde el aire" fill sizes="100vw" />
      <div className="closing-grid">
        <div className="box">
          <p className="eyebrow">Tu punto de partida</p>
          <h2>Tu viaje empieza con datos y objetivos</h2>
          <div>
            <Link className="btn btn-solid" href="/empezar">
              Agenda tu evaluación
            </Link>
          </div>
          <div className="note">Prueba de 2 semanas · Cupos limitados por sede</div>
        </div>

        {/* Ciclo SRXFit — el "flywheel" de srxfit.com */}
        <div className="flywheel">
          <svg viewBox="0 0 440 440" role="img" aria-label="Ciclo SRXFit: evaluación, prescripción, ejecución, seguimiento, reevaluación">
            <defs>
              <path id="mkt-fly-text-path" d="M 220,55 A 165,165 0 1,1 219.99,55" />
              <linearGradient id="mkt-fly-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6B4FB5" />
                <stop offset="33%" stopColor="#3A8FD1" />
                <stop offset="66%" stopColor="#C9F543" />
                <stop offset="100%" stopColor="#FF6B5A" />
              </linearGradient>
            </defs>

            <circle cx={C} cy={C} r="190" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.6" />

            {TICKS.map((t) => (
              <line
                key={t.deg}
                x1={t.p1.x.toFixed(2)}
                y1={t.p1.y.toFixed(2)}
                x2={t.p2.x.toFixed(2)}
                y2={t.p2.y.toFixed(2)}
                stroke="currentColor"
                strokeOpacity={t.major ? 0.4 : 0.15}
                strokeWidth="0.6"
              />
            ))}

            <circle
              cx={C}
              cy={C}
              r="138"
              fill="none"
              stroke="url(#mkt-fly-stroke)"
              strokeOpacity="0.35"
              strokeWidth="0.8"
              strokeDasharray="2 4"
            />

            <text
              fontFamily="var(--sans)"
              fontWeight="300"
              fontSize="11"
              letterSpacing="0.32em"
              fill="currentColor"
              fillOpacity="0.85"
            >
              <textPath href="#mkt-fly-text-path" startOffset="0">
                {CYCLE_TEXT}
              </textPath>
            </text>

            {NODES.map((n) => (
              <g key={n.color}>
                <circle cx={n.x.toFixed(2)} cy={n.y.toFixed(2)} r="6" fill={n.color} stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.5" />
                <circle cx={n.x.toFixed(2)} cy={n.y.toFixed(2)} r="11" fill="none" stroke={n.color} strokeOpacity="0.45" strokeWidth="0.5" />
              </g>
            ))}
          </svg>

          <div className="fly-core">
            <div className="core-k">◆ Core</div>
            <div className="core-t">
              Scientifically
              <br />
              Prescribed
              <br />
              Fitness
            </div>
            <div className="core-v">SRXFIT · v1</div>
          </div>
        </div>
      </div>
    </section>
  );
}
