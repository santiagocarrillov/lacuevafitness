"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const sedes = [
  { value: "", label: "Todas" },
  { value: "FITNESS_CENTER", label: "Fitness Center" },
  { value: "XTREME", label: "Xtreme" },
];

const statuses = [
  { value: "", label: "Todos" },
  { value: "ACTIVE", label: "Activos" },
  { value: "TRIAL", label: "Trial" },
  { value: "PAUSED", label: "Pausados" },
  { value: "CHURNED", label: "Bajas" },
];

export function MemberFilters({
  currentSede,
  currentStatus,
  currentSearch,
}: {
  currentSede?: string;
  currentStatus?: string;
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
    params.delete("page"); // reset to page 1
    router.push(`/dashboard/socios?${params.toString()}`);
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3">
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
      <div className="flex gap-1.5 flex-wrap">
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
        {statuses.map((s) => (
          <Button
            key={s.value}
            variant={currentStatus === s.value || (!currentStatus && !s.value) ? "default" : "outline"}
            size="sm"
            onClick={() => updateParam("status", s.value)}
          >
            {s.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
