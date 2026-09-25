import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getMemberNutritionFollowUp } from "@/lib/actions/nutrition-followup";
import { ADHERENCE_META } from "@/lib/nutrition/adherence";
import { MEAL_LABEL, isMealKey } from "@/lib/nutrition/meals";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StaffThread } from "./staff-thread";

export const dynamic = "force-dynamic";

export default async function MemberFollowUpPage({ params }: { params: Promise<{ memberId: string }> }) {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) redirect("/dashboard/nutricion");
  const { memberId } = await params;
  const data = await getMemberNutritionFollowUp(memberId);
  if (!data) notFound();
  const name = `${data.member.firstName} ${data.member.lastName}`.trim();
  const label = (k: string) => data.mealLabels[k] ?? (isMealKey(k) ? MEAL_LABEL[k] : k);

  return (
    <div className="space-y-4">
      <Link href="/dashboard/nutricion/socios" className="text-sm text-muted-foreground hover:underline">
        ← Socios
      </Link>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">
          <Link href={`/dashboard/socios/${data.member.id}`} className="hover:underline">
            {name}
          </Link>
        </h2>
        <div className="flex gap-3 text-sm">
          {data.plan?.structured ? (
            <Link href={`/dashboard/nutricion/planes/socio/${data.plan.id}`} className="font-medium hover:underline">
              Editar plan →
            </Link>
          ) : (
            <Link href={`/dashboard/nutricion/planes?socio=${data.member.id}`} className="font-medium hover:underline">
              Crear plan →
            </Link>
          )}
          <Link href={`/dashboard/nutricion?nuevo=${data.member.id}`} className="font-medium hover:underline">
            Agendar cita →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cumplimiento · 14 días</CardTitle>
            <CardDescription>
              {data.plan ? data.plan.title : "Sin plan publicado"}
              {data.target ? ` · meta ${data.target.kcal} kcal` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th />
                  {data.days.map((d) => (
                    <th key={d.date.getTime()} className="px-1 font-normal text-muted-foreground">
                      {d.date.toLocaleDateString("es-EC", { timeZone: "UTC", weekday: "narrow" })}
                      <span className="block">{d.date.getUTCDate()}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.mealKeys.map((k) => (
                  <tr key={k}>
                    <td className="pr-2 py-0.5 whitespace-nowrap text-muted-foreground">{label(k)}</td>
                    {data.days.map((d) => {
                      const e = d.entries.find((x) => x.mealKey === k);
                      return (
                        <td key={d.date.getTime()} className="px-1 py-0.5 text-center" title={e?.freeText ?? e?.optionLabel ?? ""}>
                          {!e ? <span className="text-muted-foreground/40">·</span> : e.ate ? "✅" : "❌"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="pr-2 pt-1 text-muted-foreground">Día</td>
                  {data.days.map((d) => (
                    <td key={d.date.getTime()} className="px-1 pt-1 text-center" title={d.note ?? ""}>
                      {d.adherence ? ADHERENCE_META[d.adherence].emoji : <span className="text-muted-foreground/40">·</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            {data.days.some((d) => d.note || d.entries.some((e) => e.freeText)) && (
              <div className="mt-3 space-y-1 text-xs">
                {data.days.flatMap((d) =>
                  [
                    d.note ? { k: `${d.date.getTime()}-n`, t: `${d.date.getUTCDate()}: ${d.note}` } : null,
                    ...d.entries
                      .filter((e) => e.freeText)
                      .map((e) => ({ k: `${d.date.getTime()}-${e.mealKey}`, t: `${d.date.getUTCDate()} · ${label(e.mealKey)}: ${e.freeText}` })),
                  ].filter((x): x is { k: string; t: string } => x !== null),
                ).map((x) => (
                  <p key={x.k} className="text-muted-foreground">
                    {x.t}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversación</CardTitle>
            <CardDescription>Lo que el socio te escribe desde la app. Tu respuesta le llega como notificación.</CardDescription>
          </CardHeader>
          <CardContent>
            <StaffThread
              memberId={data.member.id}
              memberFirstName={data.member.firstName}
              messages={data.messages.map((m) => ({
                id: m.id,
                author: m.author,
                body: m.body,
                createdAt: m.createdAt.toISOString(),
                mealLabel: m.mealKey ? label(m.mealKey) : null,
                unread: m.author === "MEMBER" && !m.readAt,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
