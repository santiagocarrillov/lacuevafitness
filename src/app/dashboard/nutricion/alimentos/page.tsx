import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { listFoods, type FoodListFilter } from "@/lib/actions/foods";
import { EXCHANGE_GROUPS } from "@/lib/nutrition/exchanges";
import { FoodsTable } from "./foods-table";

export const dynamic = "force-dynamic";

const FILTERS = new Set<string>(["todos", "sin-verificar", "archivados", ...EXCHANGE_GROUPS]);

export default async function AlimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filtro?: string; p?: string }>;
}) {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) redirect("/dashboard/nutricion");
  const params = await searchParams;
  const filter = (FILTERS.has(params.filtro ?? "") ? params.filtro : "todos") as FoodListFilter;
  const page = Number(params.p) || 1;
  const q = params.q?.trim() ?? "";

  const data = await listFoods({ q, filter, page });
  return <FoodsTable {...data} q={q} filter={filter} />;
}
