"use client";

import { useEffect, useRef } from "react";
import { useSpotlight } from "./use-spotlight";

/** Las 6 estaciones = el ciclo SRXFIT. El viaje ES la metodología. */
const STATIONS = [
  {
    step: "01 · El Test",
    title: "Llegas. Te evaluamos.",
    text: "Composición corporal y capacidades motoras. Sin diagnóstico no hay prescripción — solo opinión.",
  },
  {
    step: "02 · La Prescripción",
    title: "Tu dosis exacta.",
    text: "Como un medicamento: cargas, patrones y volumen para tu punto de partida. Nada genérico.",
  },
  {
    step: "03 · La Ejecución",
    title: "Entrenas con propósito.",
    text: "Cinco bloques por sesión: movilidad, activación, fuerza, metcon y regulación. El orden no se negocia.",
  },
  {
    step: "04 · El Seguimiento",
    title: "Medimos. Ajustamos.",
    text: "Cada avance queda registrado y fechado. La programación contiene las decisiones.",
  },
  {
    step: "05 · La Reevaluación",
    title: "La prueba, en números.",
    text: "Cada 9 semanas repetimos la batería. Ves tu progreso en datos, no en sensaciones.",
  },
  {
    step: "06 · Longevidad",
    title: "Científicamente superhumano.",
    text: "Fuerza, salud y años de vida útil — por diseño. No es el final: es tu nuevo punto de partida.",
  },
] as const;

const NAMES = ["TEST", "PRESCRIPCIÓN", "EJECUCIÓN", "SEGUIMIENTO", "REEVALUACIÓN", "LONGEVIDAD"];
const FRACS = [0.02, 0.21, 0.4, 0.58, 0.77, 0.975];

/** Escala de zonas: la figura viaja de recuperación (morado) a pico (rojo). */
const ZONES: [number, number, number][] = [
  [107, 79, 181],
  [58, 143, 209],
  [0, 212, 196],
  [201, 245, 67],
  [245, 166, 35],
  [255, 107, 90],
];

function zoneColor(p: number) {
  const t = Math.min(0.999, Math.max(0, p)) * (ZONES.length - 1);
  const i = Math.floor(t);
  const f = t - i;
  const a = ZONES[i];
  const b = ZONES[Math.min(ZONES.length - 1, i + 1)];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

const SCENE_H = 700;
const SCENE_W = 5200;
// Ruta HORIZONTAL y ascendente: el scroll baja, pero el viaje avanza y sube.
const PATH_D =
  "M 120 560 C 700 560, 900 470, 1400 480 C 1900 490, 2100 390, 2600 400 C 3100 410, 3300 305, 3800 315 C 4300 325, 4600 235, 5080 200";

export function Method() {
  const stageRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const journeyRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const faintRef = useRef<SVGPathElement>(null);
  const brightRef = useRef<SVGPathElement>(null);
  const walkerRef = useRef<SVGGElement>(null);
  const figureRef = useRef<SVGGElement>(null);
  const stationsRef = useRef<SVGGElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const capInnerRef = useRef<HTMLDivElement>(null);
  const capStepRef = useRef<HTMLDivElement>(null);
  const capTitleRef = useRef<HTMLHeadingElement>(null);
  const capTextRef = useRef<HTMLParagraphElement>(null);

  useSpotlight(stageRef, glowRef, 1);

  useEffect(() => {
    const svg = svgRef.current;
    const pf = faintRef.current;
    const pb = brightRef.current;
    const walker = walkerRef.current;
    const figure = figureRef.current;
    const journey = journeyRef.current;
    if (!svg || !pf || !pb || !walker || !figure || !journey) return;

    const L = pf.getTotalLength();
    pb.style.strokeDasharray = String(L);
    pb.style.strokeDashoffset = String(L);

    const dots = Array.from(stationsRef.current?.querySelectorAll<SVGCircleElement>(".station-dot") ?? []);
    const lbls = Array.from(stationsRef.current?.querySelectorAll<SVGTextElement>(".station-lbl") ?? []);
    const rails = Array.from(railRef.current?.querySelectorAll<HTMLElement>("i") ?? []);
    const figLines = Array.from(figure.querySelectorAll("line"));
    const figHead = figure.querySelector("circle");

    let curCap = -1;
    let vbw = 1244;

    const computeVBW = () => {
      const r = svg.getBoundingClientRect();
      const aspect =
        r.width > 0 && r.height > 0
          ? r.width / r.height
          : (window.innerWidth || 1280) / (window.innerHeight || 720);
      vbw = SCENE_H * aspect;
    };

    const render = () => {
      computeVBW();
      const rect = journey.getBoundingClientRect();
      const total = journey.offsetHeight - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;

      const curLen = p * L;
      const pt = pf.getPointAtLength(curLen);

      // Cámara horizontal: centra el punto actual.
      const camX = Math.min(SCENE_W - vbw, Math.max(0, pt.x - vbw / 2));
      svg.setAttribute("viewBox", `${camX.toFixed(1)} 0 ${vbw.toFixed(1)} ${SCENE_H}`);
      pb.style.strokeDashoffset = String(L - curLen);
      walker.setAttribute("transform", `translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`);

      const col = zoneColor(p);
      figLines.forEach((l) => l.setAttribute("stroke", col));
      figHead?.setAttribute("fill", col);
      figure.style.filter = `drop-shadow(0 0 9px ${col})`;

      let active = 0;
      FRACS.forEach((f, i) => {
        const on = curLen >= f * L - 4;
        dots[i]?.classList.toggle("active", on);
        lbls[i]?.classList.toggle("active", on);
        rails[i]?.classList.toggle("on", on);
        if (rails[i]) rails[i].style.background = on ? zoneColor(f) : "";
        if (on) active = i;
      });

      if (active !== curCap) {
        curCap = active;
        const s = STATIONS[active];
        if (capStepRef.current) {
          capStepRef.current.textContent = s.step;
          capStepRef.current.style.color = zoneColor(FRACS[active]);
        }
        if (capTitleRef.current) capTitleRef.current.textContent = s.title;
        if (capTextRef.current) capTextRef.current.textContent = s.text;
        const inner = capInnerRef.current;
        if (inner) {
          inner.classList.remove("show");
          void inner.offsetWidth; // fuerza reflow para reiniciar la transición
          inner.classList.add("show");
        }
      }
    };

    // Los eventos de scroll ya vienen coalescidos a ~60fps: render directo basta
    // (un bucle rAF infinito saturaba la CPU).
    const onResize = () => {
      computeVBW();
      render();
    };
    window.addEventListener("scroll", render, { passive: true });
    window.addEventListener("resize", onResize);
    render();

    return () => {
      window.removeEventListener("scroll", render);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <section className="cave" id="metodo">
      <div className="journey" ref={journeyRef}>
        <div className="stage" ref={stageRef}>
          <div className="aurora aurora-a" />
          <div className="aurora aurora-b" />
          <div className="cave-glow" ref={glowRef} />

          <div className="cave-head">
            <p className="eyebrow">El Método SRXFIT</p>
            <h2>
              De la evaluación a la <em>longevidad</em>.
            </h2>
          </div>

          <svg
            className="scene"
            ref={svgRef}
            preserveAspectRatio="xMidYMid slice"
            viewBox="0 0 1244 700"
            role="img"
            aria-label="El recorrido del método SRXFIT: del test a la longevidad"
          >
            <defs>
              <linearGradient id="mkt-trail" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
                <stop offset="0" stopColor="#6b4fb5" />
                <stop offset="0.2" stopColor="#3a8fd1" />
                <stop offset="0.42" stopColor="#00d4c4" />
                <stop offset="0.62" stopColor="#c9f543" />
                <stop offset="0.82" stopColor="#f5a623" />
                <stop offset="1" stopColor="#ff6b5a" />
              </linearGradient>
            </defs>
            <path ref={faintRef} d={PATH_D} fill="none" stroke="#242424" strokeWidth="3" strokeLinecap="round" />
            <path
              ref={brightRef}
              className="path-bright"
              d={PATH_D}
              fill="none"
              stroke="url(#mkt-trail)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <g ref={stationsRef}>
              <Stations />
            </g>
            <g ref={walkerRef}>
              <g ref={figureRef}>
                <circle cx="0" cy="-34" r="9" />
                <line x1="0" y1="-25" x2="0" y2="-4" strokeWidth="5" strokeLinecap="round" />
                <line x1="0" y1="-20" x2="-11" y2="-8" strokeWidth="4.5" strokeLinecap="round" />
                <line x1="0" y1="-20" x2="11" y2="-10" strokeWidth="4.5" strokeLinecap="round" />
                <line x1="0" y1="-4" x2="-9" y2="14" strokeWidth="5" strokeLinecap="round" />
                <line x1="0" y1="-4" x2="10" y2="13" strokeWidth="5" strokeLinecap="round" />
              </g>
            </g>
          </svg>

          <div className="caption">
            <div className="caption-inner" ref={capInnerRef}>
              <div className="step" ref={capStepRef}>
                {STATIONS[0].step}
              </div>
              <h3 ref={capTitleRef}>{STATIONS[0].title}</h3>
              <p ref={capTextRef}>{STATIONS[0].text}</p>
            </div>
          </div>

          <div className="rail" ref={railRef}>
            {STATIONS.map((s) => (
              <i key={s.step} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Puntos y etiquetas de estación. Se calculan en el servidor con la misma curva
 * que usa el cliente, así el SVG llega completo en el HTML (sin salto visual).
 */
function Stations() {
  // Muestreo de la curva de Bézier para ubicar cada estación sin depender del DOM.
  const pts = FRACS.map((f) => samplePath(f));
  return (
    <>
      {pts.map((pt, i) => (
        <g key={NAMES[i]}>
          <circle className="station-dot" cx={pt.x.toFixed(2)} cy={pt.y.toFixed(2)} r="9" />
          <text className="station-lbl" x={(pt.x - 6).toFixed(2)} y={(pt.y - 20).toFixed(2)}>
            {i + 1} · {NAMES[i]}
          </text>
        </g>
      ))}
    </>
  );
}

/** Curva de PATH_D como segmentos cúbicos, para muestrear en el servidor. */
const SEGMENTS: [number, number, number, number, number, number, number, number][] = [
  [120, 560, 700, 560, 900, 470, 1400, 480],
  [1400, 480, 1900, 490, 2100, 390, 2600, 400],
  [2600, 400, 3100, 410, 3300, 305, 3800, 315],
  [3800, 315, 4300, 325, 4600, 235, 5080, 200],
];

function cubic(t: number, s: [number, number, number, number, number, number, number, number]) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = s;
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * x0 + b * x1 + c * x2 + d * x3, y: a * y0 + b * y1 + c * y2 + d * y3 };
}

/** Aproxima getPointAtLength(frac * total) recorriendo la polilínea de la curva. */
function samplePath(frac: number) {
  const STEPS = 200;
  const pts: { x: number; y: number }[] = [];
  SEGMENTS.forEach((s, si) => {
    for (let i = si === 0 ? 0 : 1; i <= STEPS; i++) pts.push(cubic(i / STEPS, s));
  });
  const dists = [0];
  for (let i = 1; i < pts.length; i++) {
    dists.push(dists[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const target = frac * dists[dists.length - 1];
  const i = dists.findIndex((d) => d >= target);
  if (i <= 0) return pts[0];
  const seg = dists[i] - dists[i - 1];
  const t = seg === 0 ? 0 : (target - dists[i - 1]) / seg;
  return {
    x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
    y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
  };
}
