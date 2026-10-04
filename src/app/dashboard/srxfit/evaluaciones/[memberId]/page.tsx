import { redirect } from "next/navigation";

// The evaluation now opens as a panel over Evaluaciones (?socio=…). Old links
// (ficha, timeline, tareas «Evaluar a…») land here and are sent over.
export default async function MemberEvalRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { memberId } = await params;
  const sp = await searchParams;
  const p = new URLSearchParams({ socio: memberId });
  if (sp.from && sp.to) {
    p.set("from", sp.from);
    p.set("to", sp.to);
  }
  redirect(`/dashboard/srxfit/evaluaciones?${p.toString()}`);
}
