"use client";

import { useState, useTransition } from "react";
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
import { churnMember, reactivateMember, assignMembership } from "@/lib/actions/members";

type Plan = {
  id: string;
  name: string;
  priceCents: number;
  durationDays: number;
};

export function MemberActions({
  memberId,
  status,
  plans,
}: {
  memberId: string;
  status: string;
  plans: Plan[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [churnReason, setChurnReason] = useState("");
  const [churnOpen, setChurnOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

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

  function handleAssignPlan(planId: string) {
    startTransition(async () => {
      await assignMembership({ memberId, planId });
      toast.success("Membresía asignada.");
      setPlanOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      {/* Assign plan */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-medium h-7 px-2.5">
          Asignar plan
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar membresía</DialogTitle>
            <DialogDescription>Selecciona un plan para este socio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => handleAssignPlan(p.id)}
                disabled={isPending}
                className="w-full flex items-center justify-between p-3 rounded-md border hover:bg-accent transition text-sm text-left"
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">
                  ${(p.priceCents / 100).toFixed(2)} · {p.durationDays}d
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Churn / Reactivate */}
      {status === "CHURNED" ? (
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
