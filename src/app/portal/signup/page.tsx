"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { portalSignUp } from "@/lib/actions/portal-auth";

export default function PortalSignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await portalSignUp(formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/portal/hoy");
    router.refresh();
  }

  return (
    <main className="portal-auth-shell">
      <div className="portal-auth-card">
        <h1>
          Crea tu <em>cuenta</em>.
        </h1>
        <p className="sub">
          Usa el mismo correo que registraste con tu admin de La Cueva.
        </p>
        {error && <div className="err">{error}</div>}
        <form action={handleSubmit}>
          <label htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="password">Contraseña (mín. 8 caracteres)</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? "Creando…" : "Crear cuenta"}
          </button>
        </form>
        <p className="alt">
          ¿Ya tienes cuenta? <Link href="/portal/login">Iniciar sesión</Link>
        </p>
      </div>
    </main>
  );
}
