import Link from "next/link";
import { Sede } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { requireAuth, getSedeScope, can } from "@/lib/auth";
import { getSegmentMembers, getSegmentCounts, type SegmentKey } from "@/lib/actions/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SEGMENT_INFO, SEGMENT_ORDER } from "@/lib/segments/auto";
import { getSegmentDetail, listSegments } from "@/lib/actions/segment-lists";
import { MEMBER_STATUS_LABEL, STAGE_LABEL } from "@/lib/leads/stages";
import { ArchiveListButton, NewListForm } from "./list-controls";

export const dynamic = "force-dynamic";

const segmentInfo = SEGMENT_INFO;
const segmentOrder = SEGMENT_ORDER;

const sedeLabels: Record<string, string> = {
  FITNESS_CENTER: "Fitness Center",
  XTREME: "Xtreme",
};

export default async function SegmentosPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string; lista?: string }>;
}) {
  const user = await requireAuth();
  if (!can.viewSegments(user)) redirect("/dashboard?forbidden=1");
  const scopedSede = getSedeScope(user);
  const params = await searchParams;
  const activeSegment = params.segment as SegmentKey | undefined;

  const [counts, lists, activeList] = await Promise.all([
    getSegmentCounts(scopedSede ?? undefined),
    listSegments(),
    params.lista ? getSegmentDetail(params.lista) : Promise.resolve(null),
  ]);
  const members = activeSegment
    ? await getSegmentMembers(activeSegment, scopedSede ?? undefined)
    : [];

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Segmentos</h1>
        <p className="text-sm text-muted-foreground">
          Automáticos (por asistencia y membresía) y listas que arma el equipo.
          {scopedSede && ` · ${sedeLabels[scopedSede]}`}
        </p>
      </header>

      {/* Manual lists */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Listas</h2>
          <NewListForm />
        </div>
        {lists.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay listas. Créala aquí o desde la ficha de una persona (Segmentos → Agregar a una lista).
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map((l) => (
              <Link key={l.id} href={`/dashboard/segmentos?lista=${l.id}`} scroll={false}>
                <Card className={`h-full transition ${activeList?.id === l.id ? "ring-2 ring-primary" : "hover:bg-accent"}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{l.name}</CardTitle>
                      <Badge variant="outline">{l.count}</Badge>
                    </div>
                    <CardDescription className="text-xs">
                      {l.sede ? sedeLabels[l.sede] : "Ambas sedes"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
        {activeList && (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  {activeList.name} <Badge variant="outline">{activeList.people.length} personas</Badge>
                </CardTitle>
                <CardDescription>
                  {activeList.description ? `${activeList.description} · ` : ""}
                  Creada{activeList.createdBy ? ` por ${activeList.createdBy}` : ""} el{" "}
                  {new Date(activeList.createdAt).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}
                </CardDescription>
              </div>
              <ArchiveListButton id={activeList.id} name={activeList.name} />
            </CardHeader>
            <CardContent>
              {activeList.people.length === 0 ? (
                <p className="text-sm text-muted-foreground">Vacía. Agrega personas desde su ficha.</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {activeList.people.map((p) => (
                    <Link
                      key={`${p.kind}:${p.id}`}
                      href={p.kind === "member" ? `/dashboard/socios/${p.id}` : `/dashboard/leads/${p.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm transition hover:bg-accent"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {p.kind === "member"
                            ? MEMBER_STATUS_LABEL[p.status as keyof typeof MEMBER_STATUS_LABEL] ?? p.status
                            : STAGE_LABEL[p.status as keyof typeof STAGE_LABEL] ?? p.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{sedeLabels[p.sede] ?? p.sede}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {p.phone ?? ""}
                        {p.addedBy ? ` · agregado por ${p.addedBy}` : ""}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Automáticos</h2>

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
