"use client";

import { useEffect, useRef, useState } from "react";

type DetectorLike = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => DetectorLike;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

/**
 * Full-screen camera scanner for product barcodes. Uses the native
 * BarcodeDetector (Android Chrome) and falls back to ZXing (iPhone Safari has
 * no BarcodeDetector). Always offers typing the number by hand.
 */
export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let zxingStop: (() => void) | null = null;
    let cancelled = false;

    const finish = (code: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      navigator.vibrate?.(60);
      onDetectedRef.current(code);
    };

    (async () => {
      const video = videoRef.current;
      if (!video) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Tu navegador no permite usar la cámara. Escribe el número del código.");
        return;
      }
      const Native = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      try {
        if (Native) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
          if (cancelled) return;
          video.srcObject = stream;
          await video.play();
          const detector = new Native({ formats: FORMATS });
          const tick = async () => {
            if (cancelled || doneRef.current) return;
            try {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) return finish(codes[0].rawValue);
            } catch {
              /* frame not ready */
            }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (cancelled) return;
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: "environment" } }, audio: false },
            video,
            (result) => {
              if (result) finish(result.getText());
            },
          );
          zxingStop = () => controls.stop();
          if (cancelled) zxingStop();
        }
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        setError(denied ? "Necesitamos permiso para usar la cámara. También puedes escribir el número." : "No se pudo abrir la cámara. Escribe el número del código.");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      zxingStop?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "#000", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", color: "#fff" }}>
        <span style={{ fontWeight: 600 }}>Escanea el código de barras</span>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#fff", fontSize: 26, cursor: "pointer" }} aria-label="Cerrar">
          ×
        </button>
      </div>
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div
          style={{
            position: "absolute",
            left: "10%",
            right: "10%",
            top: "38%",
            height: "22%",
            border: "3px solid rgba(255,255,255,0.9)",
            borderRadius: 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
          }}
        />
        {error && (
          <p style={{ position: "absolute", top: 16, left: 16, right: 16, color: "#fff", background: "rgba(200,73,60,0.9)", padding: 10, borderRadius: 10, fontSize: 14 }}>
            {error}
          </p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const code = manual.replace(/\D/g, "");
          if (code.length >= 8) {
            doneRef.current = true;
            onDetected(code);
          }
        }}
        style={{ display: "flex", gap: 8, padding: 16, background: "#111" }}
      >
        <input
          inputMode="numeric"
          placeholder="O escribe el número"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          style={{ flex: 1, padding: "11px 12px", borderRadius: 10, border: "none", fontSize: 16 }}
        />
        <button type="submit" style={{ padding: "0 16px", borderRadius: 10, border: "none", background: "#c6f432", fontWeight: 700, cursor: "pointer" }}>
          Buscar
        </button>
      </form>
    </div>
  );
}
