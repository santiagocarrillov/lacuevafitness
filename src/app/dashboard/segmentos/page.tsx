import Link from "next/link";
import { Sede } from "@/generated/prisma/client";
import { requireAuth, getSedeScope } from "@/lib/auth";
import { getSegmentMembers, getSegmentCounts, type SegmentKey } from "@/lib/actions/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const segmentInfo: Record<SegmentKey, { title: string; description: string; emoji: string; color: string }> = {
  at_risk: {
    title: "En riesgo",
    description: "No asisten hace 7-14 días",
    emoji: "⚠",
    color: "text-amber-700 bg-amber-50 border-amber-200",
  },
  high_risk: {
    title: "Riesgo alto",
    description: "No asisten hace 14-30 días",
    emoji: "🚨",
    color: "text-red-700 bg-red-50 border-red-200",
  },
  ghost: {
    title: "Fantasmas",
    description: "30+ días sin venir",
    emoji: "👻",
    color: "text-zinc-700 bg-zinc-100 border-zinc-200",
  },
  expiring_soon: {
    title: "Por vencer",
    description: "Membresía vence en 7 días",
    emoji: "⏰",
    color: "text-amber-700 bg-amber-50 border-amber-200",
  },
  expired_no_renewal: {
    title: "Vencidos sin renovar",
    description: "Membresía expiró y no han renovado",
    emoji: "❌",
    color: "text-red-700 bg-red-50 border-red-200",
  },
  low_attendance: {
    title: "Baja frecuencia",
    description: "≤2 clases en últimos 28 días",
    emoji: "📉",
    color: "text-amber-700 bg-amber-50 border-amber-200",
  },
  morning_members: {
    title: "Cavernarios de la mañana",
    description: "Entrenan antes de mediodía",
    emoji: "🌅",
    color: "text-blue-700 bg-blue-50 border-blue-200",
  },
  afternoon_members: {
    title: "Cavernarios de la tarde",
    description: "Entrenan entre 12pm y 5pm",
    emoji: "☀️",
    color: "text-amber-700 bg-amber-50 border-amber-200",
  },
  evening_members: {
    title: "Cavernarios de la noche",
    description: "Entrenan después de 5pm",
    emoji: "🌙",
    color: "text-purple-700 bg-purple-50 border-purple-200",
  },
  champions: {
    title: "Champions",
    description: "4+ clases/semana, 90+ días",
    emoji: "🏆",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
};

const segmentOrder: SegmentKey[] = [
  "at_risk", "high_risk", "ghost",
  "expiring_soon", "expired_no_renewal", "low_attendance",
  "champions", "morning_members", "afternoon_members", "evening_members",
];

const sedeLabels: Record<string, string> = {
  FITNESS_CENTER: "Fitness Center",
  XTREME: "Xtreme",
};

export default async function SegmentosPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string }>;
}) {
  const user = await requireAuth();
  const scopedSede = getSedeScope(user);
  const params = await searchParams;
  const activeSegment = params.segment as SegmentKey | undefined;

  const counts = await getSegmentCounts(scopedSede ?? undefined);
  const members = activeSegment
    ? await getSegmentMembers(activeSegment, scopedSede ?? undefined)
    : [];

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Segmentos</h1>
        <p className="text-sm text-muted-foreground">
          Filtros inteligentes para retención y reactivación.
          {scopedSede && ` · ${sedeLabels[scopedSede]}`}
        </p>
      </header>

      {/* Segment cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {segmentOrder.map((key) => {
          const info = segmentInfo[key];
          const count = counts[key] ?? 0;
          const isActive = activeSegment === key;
          return (
            <Link
              key={key}
              href={`/dashboard/segmentos?segment=${key}`}
              scroll={false}
            >
              <Card className={`transition cursor-pointer h-full ${
                isActive ? "ring-2 ring-primary" : "hover:bg-accent"
              }`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span>{info.emoji}</span>
                      <span>{info.title}</span>
                    </CardTitle>
                    <Badge variant="outline" className={info.color}>
                      {count}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {info.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </section>

      {/* Member list for selected segment */}
      {activeSegment && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>{segmentInfo[activeSegment].emoji}</span>
              <span>{segmentInfo[activeSegment].title}</span>
              <Badge variant="outline">{members.length} socios</Badge>
            </CardTitle>
            <CardDescription>{segmentInfo[activeSegment].description}</CardDescription>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay socios en este segmento.</p>
            ) : (
              <div className="rounded-md border divide-y">
                {(members as any[]).map((m) => (
                  <Link
                    key={m.id}
                    href={`/dashboard/socios/${m.id}`}
                    className="flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {m.firstName} {m.lastName ?? ""}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {sedeLabels[m.sede] ?? m.sede}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {m.last_attendance && (
                        <span>
                          Última: {new Date(m.last_attendance).toLocaleDateString("es-EC")}
                        </span>
                      )}
                      {m.recent_attendance != null && (
                        <span>{Number(m.recent_attendance)} en 28d</span>
                      )}
                      {m.count_in_bucket != null && (
                        <span>{Number(m.count_in_bucket)} clases</span>
                      )}
                      {m.total_attendance != null && (
                        <span>{Number(m.total_attendance)} en 90d</span>
                      )}
                      {m.memberships?.[0] && (
                        <span>
                          {m.memberships[0].plan?.name} · vence{" "}
                          {new Date(m.memberships[0].endsAt).toLocaleDateString("es-EC")}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
