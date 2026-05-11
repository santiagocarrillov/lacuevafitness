"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function MemberDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces the message + stack to the browser console for debugging.
    console.error("Member detail page error:", error);
  }, [error]);

  return (
    <div className="p-8 max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">No se pudo cargar la página del socio</h1>
      <p className="text-sm text-muted-foreground">
        Ocurrió un error al renderizar los datos. El equipo técnico lo revisará. Mientras tanto puedes intentar de nuevo o volver al listado.
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground font-mono bg-muted px-3 py-2 rounded">
          Código: {error.digest}
        </p>
      )}
      <p className="text-xs text-muted-foreground italic">{error.message || "Sin mensaje."}</p>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground"
        >
          Reintentar
        </button>
        <Link
          href="/dashboard/socios"
          className="px-3 py-1.5 text-sm rounded-md border"
        >
          Volver al listado
        </Link>
      </div>
    </div>
  );
}
