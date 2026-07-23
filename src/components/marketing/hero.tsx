"use client";

import Link from "next/link";

import { useEffect, useRef } from "react";
import { useSpotlight } from "./use-spotlight";

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useSpotlight(heroRef, glowRef, 0.7);

  // Safari/iOS a veces ignora el autoplay declarativo; este empujón es inofensivo si ya corre.
  useEffect(() => {
    videoRef.current?.play().catch(() => {
      /* si el navegador lo bloquea, queda el poster — no es un error */
    });
  }, []);

  return (
    <header className="hero" id="hero" ref={heroRef}>
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/img/hero-poster.jpg"
      >
        <source src="/video/cueva-hero.mp4" type="video/mp4" />
      </video>
      <div className="hero-veil" />
      <div className="hero-glow" ref={glowRef} />

      <div className="hero-inner">
        <p className="eyebrow">Fitness Prescrito Científicamente</p>
        <h1>
          No solo entrenas.
          <br />
          <span className="line2">Te transformas.</span>
        </h1>
        <p className="hero-brush">Sé una persona más...</p>
        <p className="hero-lead">Más saludable. Más fit. Más longeva.</p>
        <div className="hero-cta">
          <Link className="btn btn-solid" href="/empezar">
            Empieza por el Test
          </Link>
          <a className="btn btn-ghost" href="#metodo">
            Ver el método
          </a>
        </div>
      </div>

      <div className="hero-foot">
        <div className="gradbar" />
        <span className="tag">#TrainDifferently · #TrainInLaCueva</span>
      </div>
    </header>
  );
}
