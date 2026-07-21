"use client";

import { useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-install-dismissed";

// Registers the service worker and, when the app isn't installed yet, shows a
// small install banner: a native "Instalar" button on Android/Chrome, or
// step-by-step instructions on iOS Safari (which has no install API).
export function PwaSetup() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const ua = window.navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    if (isIos && isSafari) {
      setShowIos(true);
      setHidden(false);
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setHidden(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setHidden(true);
  }

  if (hidden || (!deferred && !showIos)) return null;

  return (
    <div
      role="dialog"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 84, // above the bottom nav
        zIndex: 60,
        background: "var(--pt-bg-card, #fff)",
        border: "1px solid var(--pt-line, #e6e3dc)",
        borderRadius: 14,
        padding: "14px 16px",
        boxShadow: "0 8px 30px rgba(0,0,0,.18)",
        maxWidth: 460,
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <img
          src="/icons/portal-192.png"
          alt=""
          width={40}
          height={40}
          style={{ borderRadius: 9, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--pt-ink, #0b0b0b)" }}>
            Instala La Cueva
          </div>
          {deferred ? (
            <div style={{ fontSize: 12.5, color: "var(--pt-ink-2, #45494d)", marginTop: 2 }}>
              Añádela a tu pantalla de inicio para abrirla como app.
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--pt-ink-2, #45494d)", marginTop: 2, lineHeight: 1.5 }}>
              Toca <strong>Compartir</strong> <span aria-hidden>􀈂</span> y luego{" "}
              <strong>“Añadir a inicio”</strong> para instalarla como app.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {deferred && (
              <button
                type="button"
                onClick={install}
                style={{
                  padding: "8px 14px",
                  borderRadius: 9,
                  border: "none",
                  background: "var(--pt-ink, #0b0b0b)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Instalar
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              style={{
                padding: "8px 12px",
                borderRadius: 9,
                border: "1px solid var(--pt-line, #e6e3dc)",
                background: "transparent",
                color: "var(--pt-ink-3, #8a8a86)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
