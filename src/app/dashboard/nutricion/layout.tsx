import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { NutricionTabs } from "./nutricion-tabs";

export default async function NutricionLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();
  if (!can.scheduleNutrition(user)) redirect("/dashboard");

  return (
    <div className="p-4 md:p-8 space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold">Nutrición</h1>
          <p className="text-sm text-muted-foreground">
            Agenda de consultas, seguimiento de socios y contenido para la app.
          </p>
        </div>
        <NutricionTabs />
      </header>
      {children}
    </div>
  );
}
