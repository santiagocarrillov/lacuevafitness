"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const labels: Record<string, string> = {
  LOW: "Riesgo bajo",
  MEDIUM: "Riesgo medio",
  HIGH: "Riesgo alto",
  CHURNED: "Dado de baja",
};

const colors: Record<string, string> = {
  LOW: "text-emerald-700 bg-emerald-50 border-emerald-200",
  MEDIUM: "text-amber-700 bg-amber-50 border-amber-200",
  HIGH: "text-red-700 bg-red-50 border-red-200",
  CHURNED: "text-zinc-700 bg-zinc-100 border-zinc-200",
};

export function ChurnRiskBadge({ risk, reasons }: { risk: string; reasons: string[] }) {
  const [open, setOpen] = useState(false);

  if (risk === "LOW" && reasons.length === 0) {
    return (
      <Badge variant="outline" className={colors.LOW}>
        {labels.LOW}
      </Badge>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Badge
          variant="outline"
          className={`${colors[risk] ?? ""} cursor-pointer hover:opacity-80`}
        >
          {labels[risk] ?? risk}
          {reasons.length > 0 && ` · ${reasons.length}`}
        </Badge>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Score de riesgo de abandono</DialogTitle>
          <DialogDescription>
            Estado actual: <strong>{labels[risk]}</strong>
          </DialogDescription>
        </DialogHeader>
        {reasons.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-amber-600">⚠</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Sin alertas — el socio está activo.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
