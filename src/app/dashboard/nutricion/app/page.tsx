import { redirect } from "next/navigation";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { getPortalAdoption } from "@/lib/actions/portal-adoption";
import { AdoptionTable } from "./adoption-table";
import type { Sede } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export default async function PortalAdoptionPage({ searchParams }: { searchParams: Promise<{ sede?: string }> }) {
  const user = await requireAuth();
  if (!can.managePortalAccess(user)) redirect("/dashboard/nutricion");
  const params = await searchParams;
  const locked = getSedeScope(user);
  const sede: Sede | null = locked ?? (params.sede === "FITNESS_CENTER" || params.sede === "XTREME" ? params.sede : null);
  const rows = await getPortalAdoption(sede);
  return <AdoptionTable rows={rows} sede={sede} sedeLocked={locked !== null} />;
}
