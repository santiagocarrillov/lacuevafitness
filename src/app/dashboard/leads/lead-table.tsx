"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { updateLeadStage } from "@/lib/actions/leads";
import { LEAD_STAGES, MEMBER_OWNED_STAGES, STAGE_COLOR, STAGE_LABEL } from "@/lib/leads/stages";
import type { LeadStage } from "@/generated/prisma/client";
import { DataTable, PersonCell, relativeDays, td, th } from "@/components/list/list-ui";

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
  lastActivityAt: Date | null;
  owner: { fullName: string } | null;
  interactions: { summary: string; occurredAt: Date }[];
  member: { id: string; status: string } | null;
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

const sedeShort: Record<string, string> = { FITNESS_CENTER: "Fitness", XTREME: "Xtreme" };

const dateFmt = (d: Date) =>
  new Date(d).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Guayaquil" });

export function LeadTable({ leads }: { leads: LeadRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function changeStage(lead: LeadRow, next: string) {
    // "Socio activo" is not a label: converting means registering the plan.
    if (next === "CONVERTED" && !lead.member) {
      router.push(`/dashboard/leads/${lead.id}/convertir`);
      return;
    }
    start(async () => {
      await updateLeadStage(lead.id, next as LeadStage);
      toast.success(`Etapa: ${STAGE_LABEL[next as LeadStage]}`);
      router.refresh();
    });
  }

  return (
    <DataTable>
      <thead>
        <tr>
          <th className={th}>Nombre</th>
          <th className={th}>Teléfono</th>
          <th className={th}>Canal</th>
          <th className={th}>Etapa</th>
          <th className={th}>Responsable</th>
          <th className={th}>Última actividad</th>
          <th className={th}>Creado</th>
        </tr>
      </thead>
      <tbody>
        {leads.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
              No hay leads que coincidan con los filtros.
            </td>
          </tr>
        ) : (
          leads.map((l) => {
            const name = `${l.firstName} ${l.lastName ?? ""}`.trim();
            return (
              <tr key={l.id} className="transition hover:bg-muted/40">
                <td className={td}>
                  <PersonCell
                    href={l.member ? `/dashboard/socios/${l.member.id}` : `/dashboard/leads/${l.id}`}
                    name={name}
                    sub={l.member ? "Ya es socio" : l.email}
                  />
                </td>
                <td className={`${td} whitespace-nowrap text-muted-foreground`}>{l.phone ?? "--"}</td>
                <td className={td}>
                  <span className="whitespace-nowrap">{sourceLabels[l.source] ?? l.source}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{sedeShort[l.sede]}</span>
                  {(l.adHeadline || l.adSourceId) && (
                    <span className="block max-w-[220px] truncate text-xs text-muted-foreground" title={l.adHeadline ?? `Anuncio ${l.adSourceId}`}>
                      Anuncio: {l.adHeadline ?? "(sin título)"}
                    </span>
                  )}
                </td>
                <td className={td}>
                  <select
                    value={l.stage}
                    disabled={pending || !!l.member}
                    title={l.member ? "Es socio: su estado se ve en su ficha" : "Cambiar etapa"}
                    onChange={(e) => changeStage(l, e.target.value)}
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[l.stage as LeadStage] ?? ""}`}
                  >
                    {LEAD_STAGES.map((s) => (
                      <option key={s} value={s} disabled={MEMBER_OWNED_STAGES.includes(s) && s !== "CONVERTED" && s !== l.stage}>
                        {STAGE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={`${td} whitespace-nowrap`}>{l.owner?.fullName ?? <span className="text-muted-foreground">--</span>}</td>
                <td className={`${td} whitespace-nowrap`} title={l.interactions[0]?.summary}>
                  {relativeDays(l.lastActivityAt)}
                </td>
                <td className={`${td} whitespace-nowrap text-muted-foreground`}>{dateFmt(l.createdAt)}</td>
              </tr>
            );
          })
        )}
      </tbody>
    </DataTable>
  );
}

