"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { requestPortalPasswordReset } from "@/lib/actions/portal-auth";

export default function PortalRecoverPage() {
  return (
    <Suspense>
      <RecoverForm />
    </Suspense>
  );
}

function RecoverForm() {
  const params = useSearchParams();
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const expired = params.get("expired");

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await requestPortalPasswordReset(formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEmail(String(formData.get("email") ?? ""));
    setSent(true);
  }

  if (sent) {
    return (
      <main className="portal-auth-shell">
        <div className="portal-auth-card">
          <h1>
            Revisa tu <em>correo</em>.
          </h1>
          <p className="sub">
            Si <strong>{email}</strong> está registrado en La Cueva, te enviamos un
            enlace para crear una contraseña nueva. Caduca en 24 horas.
          </p>
          <div className="ok">¿No llega? Revisa spam, o pídele el acceso a tu admin.</div>
          <p className="alt">
            <Link href="/portal/login">Volver a iniciar sesión</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="portal-auth-shell">
      <div className="portal-auth-card">
        <h1>
          Recupera tu <em>acceso</em>.
        </h1>
        <p className="sub">
          Escribe el correo con el que entras al portal y te mandamos un enlace
          para crear una contraseña nueva.
        </p>
        {expired && (
          <div className="err">
            Ese enlace ya se usó o caducó. Pide uno nuevo aquí.
          </div>
        )}
        {error && <div className="err">{error}</div>}
        <form action={handleSubmit}>
          <label htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <button type="submit" disabled={loading}>
            {loading ? "Enviando…" : "Enviarme el enlace"}
          </button>
        </form>
        <p className="alt">
          ¿Nunca activaste tu cuenta? <Link href="/portal/signup">Crear cuenta</Link>
        </p>
      </div>
    </main>
  );
}
