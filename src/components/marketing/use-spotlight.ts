"use client";

import { useEffect, type RefObject } from "react";

/**
 * Halo radial que sigue al cursor con easing (receta de srxfit.com: radial + mix-blend screen).
 * El primer movimiento posiciona el halo bajo el cursor sin easing; a partir de ahí lo persigue.
 */
export function useSpotlight(
  containerRef: RefObject<HTMLElement | null>,
  glowRef: RefObject<HTMLElement | null>,
  maxOpacity = 0.7,
) {
  useEffect(() => {
    const container = containerRef.current;
    const glow = glowRef.current;
    if (!container || !glow) return;

    let gx = 0;
    let gy = 0;
    let tx = 0;
    let ty = 0;
    let raf: number | null = null;
    let primed = false;

    const follow = () => {
      gx += (tx - gx) * 0.12;
      gy += (ty - gy) * 0.12;
      glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
      raf =
        Math.abs(tx - gx) > 0.5 || Math.abs(ty - gy) > 0.5
          ? requestAnimationFrame(follow)
          : null;
    };

    const onMove = (e: PointerEvent) => {
      const r = container.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (!primed) {
        primed = true;
        gx = tx;
        gy = ty;
        glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
      }
      glow.style.opacity = String(maxOpacity);
      if (raf === null) raf = requestAnimationFrame(follow);
    };

    const onLeave = () => {
      glow.style.opacity = "0";
    };

    container.addEventListener("pointermove", onMove, { passive: true });
    container.addEventListener("pointerleave", onLeave, { passive: true });

    return () => {
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [containerRef, glowRef, maxOpacity]);
}
