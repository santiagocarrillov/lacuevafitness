import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPlansOverview } from "@/lib/actions/meal-plans";
import { PlansOverview } from "./plans-overview";

export const dynamic = "force-dynamic";

export default async function PlanesPage({ searchParams }: { searchParams: Promise<{ socio?: string }> }) {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) redirect("/dashboard/nutricion");
  const { socio } = await searchParams;
  const [data, prefill] = await Promise.all([
    listPlansOverview(),
    socio
      ? prisma.member.findUnique({ where: { id: socio }, select: { id: true, firstName: true, lastName: true } })
      : Promise.resolve(null),
  ]);
  return <PlansOverview {...data} prefillMember={prefill} />;
}
