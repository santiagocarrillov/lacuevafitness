import { requireAuth } from "@/lib/auth";
import { FormPage } from "@/app/dashboard/form-page";
import { safeBack } from "@/lib/safe-back";
import { NewChallengeForm } from "../challenge-form";

export const dynamic = "force-dynamic";

export default async function NuevoRetoPage({ searchParams }: { searchParams: Promise<{ volver?: string }> }) {
  await requireAuth();
  const { volver } = await searchParams;
  return (
    <FormPage
      title="Crear reto"
      description="Retos de asistencia inscriben a todos los socios activos. Los retos SRXFIT arman un ranking en vivo."
    >
      <NewChallengeForm backHref={safeBack(volver, "/dashboard/retos")} />
    </FormPage>
  );
}
