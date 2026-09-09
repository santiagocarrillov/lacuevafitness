"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { portalSetPassword } from "@/lib/actions/portal-auth";

/**
 * Landing screen of a recovery link. /auth/confirm already turned the emailed
 * token into a session, so the socio just types the new password here.
 */
export default function PortalNewPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await portalSetPassword(formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    router.refresh();
    setTimeout(() => router.push("/portal/hoy"), 900);
  }

  return (
    <main className="portal-auth-shell">
      <div className="portal-auth-card">
        <h1>
          Tu nueva <em>contraseña</em>.
        </h1>
        <p className="sub">Elige una de al menos 8 caracteres. Se guarda al instante.</p>
        {error && <div className="err">{error}</div>}
        {done ? (
          <div className="ok">Listo. Entrando a tu portal…</div>
        ) : (
          <form action={handleSubmit}>
            <label htmlFor="password">Contraseña nueva</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <label htmlFor="confirm">Repítela</label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
        )}
        <p className="alt">
          <Link href="/portal/login">Volver a iniciar sesión</Link>
        </p>
      </div>
    </main>
  );
}
