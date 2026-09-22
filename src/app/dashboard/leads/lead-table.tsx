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
import { LEAD_STAGES as allStages, STAGE_COLOR, STAGE_LABEL } from "@/lib/leads/stages";
import type { LeadStage } from "@/generated/prisma/client";

// La fila llega con `stage: string` (viene serializada del servidor), así que se
// indexa con un cast controlado en vez de ensuciar los mapas con index signatures.
const stageLabels = (s: string) => STAGE_LABEL[s as LeadStage] ?? s;
const stageColors = (s: string) => STAGE_COLOR[s as LeadStage] ?? "";
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
  adSourceId: string | null;
  adHeadline: string | null;
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
      await updateLeadStage(lead.id, newStage as LeadStage);
      toast.success(`Etapa actualizada a ${stageLabels(newStage)}`);
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
                    {(l.adSourceId || l.adHeadline) && (
                      <div
                        className="mt-1 max-w-[220px] text-xs text-muted-foreground"
                        title={l.adSourceId ? `Anuncio ID ${l.adSourceId}` : undefined}
                      >
                        <span className="font-medium text-foreground">Anuncio:</span>{" "}
                        <span className="truncate">{l.adHeadline ?? "(sin título)"}</span>
                        {l.adSourceId && (
                          <div className="font-mono text-[10px] truncate">ID {l.adSourceId}</div>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <select
                      value={l.stage}
                      onChange={(e) => handleStageChange(l, e.target.value)}
                      disabled={isPending}
                      className={`text-xs rounded-md border px-2 py-1 ${stageColors(l.stage)}`}
                    >
                      {allStages.map((s) => (
                        <option key={s} value={s}>
                          {stageLabels(s)}
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
