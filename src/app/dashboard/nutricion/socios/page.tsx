import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { listNutritionFollowUp } from "@/lib/actions/nutrition-followup";
import { ADHERENCE_META } from "@/lib/nutrition/adherence";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const KIND_LABEL = { MENU: "Menú", EXCHANGES: "Intercambios", LINK: "Link (Google Doc)" } as const;

export default async function NutricionSociosPage() {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) redirect("/dashboard/nutricion");
  const rows = await listNutritionFollowUp();

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Socios con plan publicado o que te escribieron. Semáforo de los últimos 7 días (el último es hoy) según lo que marcan en su app.
      </p>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Todavía no hay socios con plan publicado en la app.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-2 font-medium">Socio</th>
                  <th className="px-4 py-2 font-medium">Últimos 7 días</th>
                  <th className="px-4 py-2 font-medium">Mensajes</th>
                  <th className="px-4 py-2 font-medium">Próxima cita</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.memberId} className={r.unread ? "bg-amber-50/60" : ""}>
                    <td className="px-4 py-2">
                      <Link href={`/dashboard/nutricion/socios/${r.memberId}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {r.planTitle ? `${r.planTitle}${r.planKind ? ` · ${KIND_LABEL[r.planKind]}` : ""}` : "Sin plan publicado"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        {r.week.map((l, i) => (
                          <span
                            key={i}
                            title={l ? ADHERENCE_META[l].hint : "sin marcar"}
                            className="inline-block size-4 rounded-full border"
                            style={{ background: l ? ADHERENCE_META[l].color : "transparent" }}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {r.unread > 0 ? (
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                          {r.unread} sin leer
                        </span>
                      ) : r.lastMessageAt ? (
                        <span className="text-xs text-muted-foreground">
                          {r.lastMessageAt.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "short" })}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {r.nextAppointment
                        ? r.nextAppointment.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", weekday: "short", day: "numeric", month: "short" })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
