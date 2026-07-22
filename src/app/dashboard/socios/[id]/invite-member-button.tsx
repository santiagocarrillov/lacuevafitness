"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { generatePortalInvite, revokePortalInvite } from "@/lib/actions/members";
import { publicBaseUrl } from "@/lib/site-url";

type ExistingInvite = { code: string; expiresAt: string } | null;

function fmtExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString("es-EC", {
    day: "numeric", month: "long", year: "numeric",
  });
}

export function InviteMemberButton({
  memberId,
  hasApp,
  memberEmail,
  existingInvite,
}: {
  memberId: string;
  hasApp: boolean;
  memberEmail: string | null;
  existingInvite: ExistingInvite;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [invite, setInvite] = useState<ExistingInvite>(existingInvite);

  // Already linked → nothing to invite. Show a quiet status pill instead.
  if (hasApp) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-muted/40 text-sm font-medium h-7 px-2.5 text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        App activa
      </span>
    );
  }

  const shareText = invite
    ? `Activa tu portal de La Cueva:\nCorreo: ${memberEmail ?? ""}\nCódigo: ${invite.code}\n${publicBaseUrl()}/portal/signup`
    : "";

  function handleGenerate() {
    startTransition(async () => {
      const res = await generatePortalInvite(memberId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setInvite({ code: res.code, expiresAt: res.expiresAt });
      toast.success("Código generado.");
      router.refresh();
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      const res = await revokePortalInvite(memberId);
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo cancelar.");
        return;
      }
      setInvite(null);
      toast.success("Invitación cancelada.");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background text-sm font-medium h-7 px-2.5 hover:bg-muted">
        Invitar a la app
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar a la app</DialogTitle>
          <DialogDescription>
            {invite
              ? "Comparte el correo y el código con el socio. Lo usa una vez en la pantalla de registro para crear su contraseña."
              : "Se generará un código de un solo uso. El socio lo canjea en /portal/signup con su correo para crear su cuenta."}
          </DialogDescription>
        </DialogHeader>

        {invite ? (
          <div className="space-y-3">
            <div className="rounded-md border p-3 space-y-2 bg-muted/40">
              <div>
                <p className="text-xs text-muted-foreground">Correo</p>
                <p className="font-mono text-sm">{memberEmail ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Código de un uso</p>
                <p className="font-mono text-lg tracking-wider select-all">{invite.code}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Válido hasta el {fmtExpiry(invite.expiresAt)}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={handleRevoke}
                disabled={isPending}
                className="text-destructive hover:text-destructive mr-auto"
              >
                Cancelar invitación
              </Button>
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={isPending}
              >
                Generar otro
              </Button>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(shareText);
                  toast.success("Copiado al portapapeles.");
                }}
              >
                Copiar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleGenerate} disabled={isPending}>
              {isPending ? "Generando…" : "Generar código"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
