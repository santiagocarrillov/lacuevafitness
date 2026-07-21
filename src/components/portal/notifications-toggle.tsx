"use client";

import { useEffect, useState } from "react";
import { savePushSubscription, removePushSubscription } from "@/lib/actions/push";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type Status = "loading" | "unsupported" | "unconfigured" | "off" | "on" | "denied";

export function NotificationsToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (!PUBLIC_KEY) {
      setStatus("unconfigured");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? "on" : "off"))
      .catch(() => setStatus("off"));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY!) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await savePushSubscription({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      });
      setStatus("on");
    } catch {
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      // keep previous state
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" || status === "unsupported" || status === "unconfigured") {
    // Hide entirely when unsupported/not configured — nothing actionable.
    return null;
  }

  return (
    <div className="portal-list-item" style={{ cursor: "default" }}>
      <div className="li-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10 21a2 2 0 004 0" />
        </svg>
      </div>
      <div className="info">
        <div className="t">Notificaciones</div>
        <div className="s">
          {status === "on"
            ? "Activadas en este dispositivo"
            : status === "denied"
              ? "Bloqueadas — actívalas en ajustes del navegador"
              : "Recibe avisos de tu gimnasio"}
        </div>
      </div>
      {status === "on" ? (
        <button
          type="button"
          onClick={disable}
          disabled={busy}
          style={pillStyle(false)}
        >
          {busy ? "…" : "Desactivar"}
        </button>
      ) : status === "denied" ? null : (
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          style={pillStyle(true)}
        >
          {busy ? "…" : "Activar"}
        </button>
      )}
    </div>
  );
}

function pillStyle(primary: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    padding: "7px 12px",
    borderRadius: 9,
    border: primary ? "none" : "1px solid var(--pt-line, #e6e3dc)",
    background: primary ? "var(--pt-ink, #0b0b0b)" : "transparent",
    color: primary ? "#fff" : "var(--pt-ink-3, #8a8a86)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };
}
