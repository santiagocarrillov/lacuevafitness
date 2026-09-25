import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getMemberCalcContext } from "@/lib/actions/nutrition-targets";
import { CalorieCalculator } from "@/components/nutrition/calorie-calculator";

export const dynamic = "force-dynamic";

export default async function CalculadoraPage({
  searchParams,
}: {
  searchParams: Promise<{ socio?: string }>;
}) {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) redirect("/dashboard/nutricion");
  const { socio } = await searchParams;
  const context = socio ? await getMemberCalcContext(socio) : null;
  return <CalorieCalculator key={context?.memberId ?? "none"} context={context} />;
}
