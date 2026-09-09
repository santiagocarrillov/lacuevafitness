"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  generatePortalInvite,
  revokePortalInvite,
  emailPortalInvite,
  resetMemberPassword,
  sendMemberRecoveryLink,
  unlinkMemberAccount,
} from "@/lib/actions/members";
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
  // Already linked → the admin's job is troubleshooting, not inviting.
  if (hasApp) {
    return <MemberAccessDialog memberId={memberId} memberEmail={memberEmail} />;
  }
  return (
    <InviteDialog
      memberId={memberId}
      memberEmail={memberEmail}
      existingInvite={existingInvite}
    />
  );
}

/* ── Not linked yet: issue / resend the one-time code ─────────────── */

function InviteDialog({
  memberId,
  memberEmail,
  existingInvite,
}: {
  memberId: string;
  memberEmail: string | null;
  existingInvite: ExistingInvite;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [invite, setInvite] = useState<ExistingInvite>(existingInvite);

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

  function handleEmail() {
    startTransition(async () => {
      const res = await emailPortalInvite(memberId);
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo enviar el correo.");
        return;
      }
      toast.success(`Invitación enviada a ${memberEmail}.`);
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
              <Button variant="outline" onClick={handleGenerate} disabled={isPending}>
                Generar otro
              </Button>
              {memberEmail && (
                <Button variant="outline" onClick={handleEmail} disabled={isPending}>
                  Enviar por correo
                </Button>
              )}
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

/* ── Already linked: password troubleshooting ─────────────────────── */

function MemberAccessDialog({
  memberId,
  memberEmail,
}: {
  memberId: string;
  memberEmail: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  function reset() {
    setTempPassword(null);
    setRecoveryLink(null);
    setConfirmUnlink(false);
  }

  function handleTempPassword() {
    startTransition(async () => {
      const res = await resetMemberPassword(memberId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRecoveryLink(null);
      setTempPassword(res.password);
    });
  }

  function handleRecoveryLink() {
    startTransition(async () => {
      const res = await sendMemberRecoveryLink(memberId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTempPassword(null);
      setRecoveryLink(res.link);
      toast[res.emailed ? "success" : "warning"](
        res.emailed
          ? `Enlace enviado a ${memberEmail}.`
          : "No se pudo enviar el correo — comparte el enlace por WhatsApp.",
      );
    });
  }

  function handleUnlink() {
    startTransition(async () => {
      const res = await unlinkMemberAccount(memberId);
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo desvincular.");
        return;
      }
      toast.success("Cuenta desvinculada. Ya puedes generar una invitación nueva.");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}
    >
      <DialogTrigger className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-muted/40 text-sm font-medium h-7 px-2.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        App activa
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Acceso a la app</DialogTitle>
          <DialogDescription>
            El socio entra con <span className="font-mono">{memberEmail ?? "—"}</span>.
            Si perdió la contraseña, resuélvelo desde aquí.
          </DialogDescription>
        </DialogHeader>

        {tempPassword && (
          <div className="rounded-md border p-3 space-y-2 bg-muted/40">
            <p className="text-xs text-muted-foreground">Contraseña temporal</p>
            <p className="font-mono text-lg tracking-wider select-all">{tempPassword}</p>
            <p className="text-xs text-muted-foreground">
              La anterior dejó de funcionar. El socio puede cambiarla desde Mi cuenta.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(
                  `Tu acceso a La Cueva:\nCorreo: ${memberEmail ?? ""}\nContraseña: ${tempPassword}\n${publicBaseUrl()}/portal/login`,
                );
                toast.success("Copiado al portapapeles.");
              }}
            >
              Copiar para WhatsApp
            </Button>
          </div>
        )}

        {recoveryLink && (
          <div className="rounded-md border p-3 space-y-2 bg-muted/40">
            <p className="text-xs text-muted-foreground">
              Enlace de recuperación (un solo uso, caduca en 24 h)
            </p>
            <p className="font-mono text-xs break-all select-all">{recoveryLink}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(
                  `Crea tu contraseña nueva de La Cueva aquí (caduca en 24 h):\n${recoveryLink}`,
                );
                toast.success("Copiado al portapapeles.");
              }}
            >
              Copiar para WhatsApp
            </Button>
          </div>
        )}

        {confirmUnlink ? (
          <div className="rounded-md border border-destructive/40 p-3 space-y-3">
            <p className="text-sm">
              Se desactiva el acceso actual y la ficha queda lista para una invitación
              nueva. Úsalo solo si el correo quedó mal o el socio lo perdió. El
              historial del socio no se toca.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirmUnlink(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleUnlink} disabled={isPending}>
                {isPending ? "Desvinculando…" : "Sí, desvincular"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 justify-end pt-1">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive mr-auto"
              onClick={() => setConfirmUnlink(true)}
              disabled={isPending}
            >
              Desvincular cuenta
            </Button>
            {memberEmail && (
              <Button variant="outline" onClick={handleRecoveryLink} disabled={isPending}>
                Enviar enlace de recuperación
              </Button>
            )}
            <Button onClick={handleTempPassword} disabled={isPending}>
              {isPending ? "Generando…" : "Contraseña temporal"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
