"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadCertificate } from "@/lib/actions/invoicing";
import { ENTITIES } from "@/lib/finance/entities";
import type { CertStatus } from "@/lib/invoicing/emit";

export function CertificatesCard({ statuses, isOwner }: { statuses: CertStatus[]; isOwner: boolean }) {
  const [pending, start] = useTransition();
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h2 className="font-semibold">Firma electrónica</h2>
        <p className="text-xs text-muted-foreground">
          Un archivo .p12 por entidad. La clave de la firma no se guarda en la app: va como variable de entorno en Vercel
          (Settings → Environment Variables) y luego hay que volver a desplegar.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {statuses.map((c) => (
          <div key={c.sede} className="space-y-2 rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium">{ENTITIES[c.sede].legalName}</p>
              <span className={`text-xs font-medium ${c.ready ? "text-emerald-600" : "text-amber-600"}`}>{c.ready ? "Lista para emitir" : "Pendiente"}</span>
            </div>
            <ul className="space-y-0.5 text-xs">
              <li>{c.uploaded ? "✓" : "✗"} Archivo .p12 subido</li>
              <li>
                {c.passwordSet ? "✓" : "✗"} Clave en Vercel: <code className="rounded bg-muted px-1">SRI_CERT_PASSWORD_{c.sede}</code>
              </li>
              {c.subject && <li className="text-muted-foreground">Titular: {c.subject}</li>}
              {c.validUntil && <li className="text-muted-foreground">Vence: {c.validUntil}</li>}
              {c.error && <li className="text-destructive">{c.error}</li>}
            </ul>
            {isOwner && (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  fd.set("sede", c.sede);
                  start(async () => {
                    try {
                      const s = await uploadCertificate(fd);
                      toast.success(s.ready ? "Firma lista para emitir" : "Firma subida. Falta la clave en Vercel.");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "No se pudo subir.");
                    }
                  });
                }}
              >
                <input name="file" type="file" accept=".p12,.pfx,application/x-pkcs12" className="w-full text-xs" required />
                <Button size="sm" variant="outline" type="submit" disabled={pending}>
                  {c.uploaded ? "Reemplazar" : "Subir"}
                </Button>
              </form>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
