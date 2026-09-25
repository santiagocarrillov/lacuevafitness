import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getMemberPlanForEdit } from "@/lib/actions/meal-plans";
import { PlanEditor } from "@/components/nutrition/plan-editor/plan-editor";

export const dynamic = "force-dynamic";

export default async function MemberPlanEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) redirect("/dashboard/nutricion");
  const { id } = await params;
  const p = await getMemberPlanForEdit(id);
  if (!p) notFound();
  return (
    <div className="space-y-3">
      <Link href="/dashboard/nutricion/planes" className="text-sm text-muted-foreground hover:underline">
        ← Planes
      </Link>
      {!p.active && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Este plan ya no está vigente (se publicó otro después). Puedes consultarlo o volver a publicarlo.
        </p>
      )}
      <PlanEditor
        mode="member"
        id={p.id}
        title={p.title}
        publishedAt={p.publishedAt?.toISOString() ?? null}
        publishedContent={p.publishedContent}
        member={p.member}
        memberTarget={p.memberTarget}
        template={p.template}
        content={p.content}
      />
    </div>
  );
}
