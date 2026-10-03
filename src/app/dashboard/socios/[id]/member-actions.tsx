"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { churnMember, reactivateMember } from "@/lib/actions/members";

export function MemberActions({
  memberId,
  status,
  canAssignPlan,
  canChurn,
}: {
  memberId: string;
  status: string;
  /** Front desk + accounting sell plans (same rule as Renovar). */
  canAssignPlan: boolean;
  /** Dar de baja / reactivar: only roles that manage members (server enforces it too). */
  canChurn: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [churnReason, setChurnReason] = useState("");
  const [churnOpen, setChurnOpen] = useState(false);

  function handleChurn() {
    startTransition(async () => {
      await churnMember(memberId, churnReason || undefined);
      toast.success("Socio dado de baja.");
      setChurnOpen(false);
      router.refresh();
    });
  }

  function handleReactivate() {
    startTransition(async () => {
      await reactivateMember(memberId);
      toast.success("Socio reactivado.");
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      {/* Assign plan — its own screen */}
      {canAssignPlan && (
        <Link
          href={`/dashboard/socios/${memberId}/membresia/nueva`}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-medium h-7 px-2.5"
        >
          Asignar plan
        </Link>
      )}

      {/* Churn / Reactivate — short confirmation, stays a dialog */}
      {!canChurn ? null : status === "CHURNED" ? (
        <Button variant="outline" size="sm" onClick={handleReactivate} disabled={isPending}>
          Reactivar
        </Button>
      ) : (
        <Dialog open={churnOpen} onOpenChange={setChurnOpen}>
          <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background text-sm font-medium h-7 px-2.5 hover:bg-muted">
            Dar de baja
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dar de baja</DialogTitle>
              <DialogDescription>
                Esto cancela la membresía activa y marca al socio como baja.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Motivo de baja (opcional)"
                value={churnReason}
                onChange={(e) => setChurnReason(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setChurnOpen(false)}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleChurn} disabled={isPending}>
                  Confirmar baja
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
