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

type Status = "loading" | "hidden" | "off" | "on" | "denied";

/**
 * "Activar avisos" in the dashboard sidebar: task assignments, comments,
 * mentions and the 7:30 summary. Same subscription as the socio app — staff
 * receive push through their own linked member record.
 */
export function StaffPushToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !PUBLIC_KEY) {
      setStatus("hidden");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
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
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY!) as BufferSource,
        }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await savePushSubscription({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent });
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
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" || status === "hidden") return null;
  if (status === "denied") {
    return (
      <p className="text-xs text-muted-foreground">
        Avisos bloqueados: actívalos en los ajustes del navegador.
      </p>
    );
  }
  return status === "on" ? (
    <button
      type="button"
      onClick={disable}
      disabled={busy}
      className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition disabled:opacity-50"
    >
      🔔 Avisos activados · desactivar
    </button>
  ) : (
    <button
      type="button"
      onClick={enable}
      disabled={busy}
      className="w-full text-left text-xs font-medium text-primary hover:underline disabled:opacity-50"
    >
      {busy ? "Activando…" : "🔔 Activar avisos de tareas"}
    </button>
  );
}
