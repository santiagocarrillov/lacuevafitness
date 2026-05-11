"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { portalSignIn } from "@/lib/actions/portal-auth";

export default function PortalLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const unlinked = params.get("unlinked");

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await portalSignIn(formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const next = params.get("next") ?? "/portal/hoy";
    router.push(next);
    router.refresh();
  }

  return (
    <main className="portal-auth-shell">
      <div className="portal-auth-card">
        <h1>
          Hola, <em>socio</em>.
        </h1>
        <p className="sub">Entra a tu portal de La Cueva.</p>
        {unlinked && (
          <div className="err">
            Tu cuenta no está vinculada a un socio. Habla con tu admin.
          </div>
        )}
        {error && <div className="err">{error}</div>}
        <form action={handleSubmit}>
          <label htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="alt">
          ¿Primera vez? <Link href="/portal/signup">Crear cuenta</Link>
        </p>
      </div>
    </main>
  );
}
