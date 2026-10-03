import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { safeBack } from "@/lib/safe-back";
import { EditChallengeForm } from "../../challenge-form";

export const dynamic = "force-dynamic";

export default async function EditarRetoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  await requireAuth();
  const [{ id }, { volver }] = await Promise.all([params, searchParams]);
  const challenge = await prisma.challenge.findFirst({
    where: { id, active: true },
    select: {
      id: true,
      name: true,
      description: true,
      reward: true,
      ruleType: true,
      ruleTarget: true,
      ruleDays: true,
      metricTest: true,
      sede: true,
      startsAt: true,
      endsAt: true,
    },
  });
  if (!challenge) notFound();
  return (
    <FormPage
      title="Editar reto"
      description="Corrige los datos del reto. Al guardar se recalcula el ranking de asistencia."
    >
      <EditChallengeForm challenge={challenge} backHref={safeBack(volver, "/dashboard/retos")} />
    </FormPage>
  );
}
