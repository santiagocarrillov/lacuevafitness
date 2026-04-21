"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const sedes = [
  { value: "", label: "Todas" },
  { value: "FITNESS_CENTER", label: "Fitness Center" },
  { value: "XTREME", label: "Xtreme" },
];

const stages = [
  { value: "", label: "Todas" },
  { value: "NEW", label: "Nuevos" },
  { value: "CONTACTED", label: "Contactados" },
  { value: "SCHEDULED_TRIAL", label: "C.P. agendada" },
  { value: "TRIAL_ATTENDED", label: "C.P. asistió" },
  { value: "TRIAL_NO_SHOW", label: "No asistió" },
  { value: "NEGOTIATING", label: "Negociando" },
  { value: "CONVERTED", label: "Convertidos" },
  { value: "LOST", label: "Perdidos" },
];

const sources = [
  { value: "", label: "Todas" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "PHONE_CALL", label: "Llamada" },
  { value: "WEB_FORM", label: "Web" },
  { value: "WALK_IN", label: "Visita directa" },
  { value: "REFERRAL", label: "Referido" },
  { value: "TIKTOK", label: "TikTok" },
];

export function LeadFilters({
  currentSede,
  currentStage,
  currentSource,
  currentSearch,
}: {
  currentSede?: string;
  currentStage?: string;
  currentSource?: string;
  currentSearch?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/dashboard/leads?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Buscar por nombre, email o teléfono..."
        defaultValue={currentSearch ?? ""}
        className="max-w-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            updateParam("q", (e.target as HTMLInputElement).value);
          }
        }}
      />
      <div className="flex flex-wrap gap-3">
        <div className="flex gap-1.5">
          {sedes.map((s) => (
            <Button
              key={s.value}
              variant={currentSede === s.value || (!currentSede && !s.value) ? "default" : "outline"}
              size="sm"
              onClick={() => updateParam("sede", s.value)}
            >
              {s.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {stages.map((s) => (
            <Button
              key={s.value}
              variant={currentStage === s.value || (!currentStage && !s.value) ? "default" : "outline"}
              size="xs"
              onClick={() => updateParam("stage", s.value)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
