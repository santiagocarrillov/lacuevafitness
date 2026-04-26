"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { updateLeadStage, convertLeadToMember } from "@/lib/actions/leads";
import { getMembershipPlans } from "@/lib/actions/members";

type LeadRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  sede: string;
  source: string;
  stage: string;
  createdAt: Date;
  owner: { fullName: string } | null;
  interactions: { summary: string; occurredAt: Date }[];
  member: { id: string; status: string } | null;
};

type Plan = {
  id: string;
  name: string;
  priceCents: number;
  durationDays: number;
};

const stageColors: Record<string, string> = {
  NEW: "text-blue-700 bg-blue-50 border-blue-200",
  CONTACTED: "text-indigo-700 bg-indigo-50 border-indigo-200",
  SCHEDULED_TRIAL: "text-purple-700 bg-purple-50 border-purple-200",
  TRIAL_ATTENDED: "text-emerald-700 bg-emerald-50 border-emerald-200",
  TRIAL_NO_SHOW: "text-amber-700 bg-amber-50 border-amber-200",
  NEGOTIATING: "text-orange-700 bg-orange-50 border-orange-200",
  CONVERTED: "text-emerald-700 bg-emerald-50 border-emerald-200",
  LOST: "text-red-700 bg-red-50 border-red-200",
};

const stageLabels: Record<string, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  SCHEDULED_TRIAL: "C.P. agendada",
  TRIAL_ATTENDED: "C.P. asistió",
  TRIAL_NO_SHOW: "No asistió",
  NEGOTIATING: "Negociando",
  CONVERTED: "Convertido",
  LOST: "Perdido",
};

const sourceLabels: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
  PHONE_CALL: "Llamada",
  WEB_FORM: "Web",
  WALK_IN: "Visita",
  REFERRAL: "Referido",
  TIKTOK: "TikTok",
  OTHER: "Otro",
};

const allStages = [
  "NEW", "CONTACTED", "SCHEDULED_TRIAL", "TRIAL_ATTENDED",
  "TRIAL_NO_SHOW", "NEGOTIATING", "CONVERTED", "LOST",
];

export function LeadTable({
  leads,
  total,
  page,
  totalPages,
}: {
  leads: LeadRow[];
  total: number;
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [convertingLead, setConvertingLead] = useState<LeadRow | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", p.toString());
    router.push(`/dashboard/leads?${params.toString()}`);
  }

  async function handleStageChange(lead: LeadRow, newStage: string) {
    // If marking as CONVERTED and no member yet → open dialog to pick plan
    if (newStage === "CONVERTED" && !lead.member) {
      const fetched = await getMembershipPlans();
      setPlans(fetched);
      setConvertingLead(lead);
      return;
    }

    startTransition(async () => {
      await updateLeadStage(lead.id, newStage as any);
      toast.success(`Etapa actualizada a ${stageLabels[newStage] ?? newStage}`);
      router.refresh();
    });
  }

  function handleConvert(planId: string) {
    if (!convertingLead) return;
    startTransition(async () => {
      const member = await convertLeadToMember(convertingLead.id, planId);
      toast.success(`Convertido a socio: ${member.firstName} ${member.lastName}`);
      setConvertingLead(null);
      router.push(`/dashboard/socios/${member.id}`);
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Fuente</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Última interacción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No hay leads que coincidan con los filtros.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    {l.member ? (
                      <Link
                        href={`/dashboard/socios/${l.member.id}`}
                        className="hover:underline"
                      >
                        {l.firstName} {l.lastName ?? ""}
                      </Link>
                    ) : (
                      <span>{l.firstName} {l.lastName ?? ""}</span>
                    )}
                    {l.member && (
                      <Badge variant="outline" className="ml-2 text-xs text-emerald-600 border-emerald-200">
                        Socio
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {sourceLabels[l.source] ?? l.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <select
                      value={l.stage}
                      onChange={(e) => handleStageChange(l, e.target.value)}
                      disabled={isPending}
                      className={`text-xs rounded-md border px-2 py-1 ${stageColors[l.stage] ?? ""}`}
                    >
                      {allStages.map((s) => (
                        <option key={s} value={s}>
                          {stageLabels[s] ?? s}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {l.email ?? l.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(l.createdAt).toLocaleDateString("es-EC")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {l.interactions[0]?.summary ?? "Sin interacciones"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} leads encontrados</span>
        {totalPages > 1 && (
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              Anterior
            </Button>
            <span className="px-2 py-1">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
              Siguiente
            </Button>
          </div>
        )}
      </div>

      {/* Convert lead dialog */}
      <Dialog open={!!convertingLead} onOpenChange={(o) => !o && setConvertingLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convertir a socio</DialogTitle>
            <DialogDescription>
              {convertingLead && (
                <>
                  Selecciona el plan que contrató{" "}
                  <strong>{convertingLead.firstName} {convertingLead.lastName ?? ""}</strong>.
                  Se creará el socio con el lead vinculado para mantener el origen.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => handleConvert(p.id)}
                disabled={isPending}
                className="w-full flex items-center justify-between p-3 rounded-md border hover:bg-accent transition text-sm text-left"
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">
                  ${(p.priceCents / 100).toFixed(2)} · {p.durationDays}d
                </span>
              </button>
            ))}
            {plans.length === 0 && (
              <p className="text-sm text-muted-foreground">Cargando planes…</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
