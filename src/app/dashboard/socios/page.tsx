import Link from "next/link";
import { Sede } from "@/generated/prisma/client";
import { getMembers, getMemberStats } from "@/lib/actions/members";
import { requireAuth, getSedeScope, parseSedeParam } from "@/lib/auth";
import { MEMBER_STATUS_LABEL } from "@/lib/leads/stages";
import { CREATED_PRESETS } from "@/lib/list-filters";
import { FilterBar, Pager, type FilterDef } from "@/components/list/filter-bar";
import { ListHeader, SummaryStrip, ViewTabs } from "@/components/list/list-ui";
import { MemberTable } from "./member-table";

export const dynamic = "force-dynamic";

type Params = { sede?: string; status?: string; q?: string; page?: string; membresia?: string; frecuencia?: string; ingreso?: string };

export default async function SociosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireAuth();
  const scopedSede = getSedeScope(user);
  const params = await searchParams;
  // Scoped users can only see their own sede — force the filter
  const sede = scopedSede ?? parseSedeParam(params.sede);

  const [result, statsFC, statsXT] = await Promise.all([
    getMembers({
      sede,
      status: params.status,
      search: params.q,
      membership: params.membresia,
      frequency: params.frecuencia,
      joined: params.ingreso,
      page: parseInt(params.page ?? "1", 10) || 1,
    }),
    getMemberStats(Sede.FITNESS_CENTER),
    getMemberStats(Sede.XTREME),
  ]);

  const keys: (keyof Params)[] = ["status", "q", "membresia", "frecuencia", "ingreso"];
  const current = Object.fromEntries(keys.filter((k) => params[k]).map((k) => [k, params[k]!]));
  const keepSede: Record<string, string> = params.sede && !scopedSede ? { sede: params.sede } : {};
  const view = (label: string, p: Record<string, string>) => {
    const same = Object.keys({ ...current, ...p }).every((k) => current[k] === p[k]);
    const qs = new URLSearchParams({ ...keepSede, ...p }).toString();
    return { label, href: qs ? `/dashboard/socios?${qs}` : "/dashboard/socios", active: same };
  };
  const link = (p: Record<string, string>) => `/dashboard/socios?${new URLSearchParams(p)}`;

  const filters: FilterDef[] = [
    {
      name: "status",
      title: "Estado",
      multi: true,
      options: (["ACTIVE", "TRIAL", "PAUSED", "LEAD", "CHURNED"] as const).map((s) => ({ value: s, label: MEMBER_STATUS_LABEL[s] })),
    },
    {
      name: "membresia",
      title: "Membresía",
      options: [
        { value: "al_dia", label: "Al día" },
        { value: "por_vencer", label: "Por vencer (7 días)" },
        { value: "vencida", label: "Vencida" },
        { value: "sin_plan", label: "Nunca ha tenido plan" },
      ],
    },
    {
      name: "frecuencia",
      title: "Asistencia (30 días)",
      options: [
        { value: "0", label: "No ha venido" },
        { value: "1-4", label: "1 a 4 visitas" },
        { value: "5-11", label: "5 a 11 visitas" },
        { value: "12+", label: "12 o más" },
      ],
    },
    { name: "ingreso", title: "Fecha de ingreso", options: CREATED_PRESETS },
    ...(scopedSede
      ? []
      : [
          {
            name: "sede",
            title: "Sede",
            options: [
              { value: "FITNESS_CENTER", label: "Fitness Center" },
              { value: "XTREME", label: "Xtreme" },
            ],
          },
        ]),
  ];

  return (
    <div className="min-h-full bg-muted/40">
      <ListHeader title="Socios" count={result.total} noun={result.total === 1 ? "registro" : "registros"}>
        <Link
          href="/dashboard/socios/nuevo"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Nuevo socio
        </Link>
      </ListHeader>

      <ViewTabs
        tabs={[
          view("Todos", {}),
          view("Activos", { status: "ACTIVE" }),
          view("En evaluación", { status: "TRIAL" }),
          view("Por vencer", { membresia: "por_vencer" }),
          view("Vencidos", { status: "ACTIVE,TRIAL", membresia: "vencida" }),
          view("Sin venir 30 días", { status: "ACTIVE,TRIAL", frecuencia: "0" }),
          view("Bajas", { status: "CHURNED" }),
        ]}
      />

      <SummaryStrip
        items={[
          {
            label: "Fitness Center",
            value: statsFC.active + statsFC.trial,
            hint: `${statsFC.active} activos · ${statsFC.trial} en evaluación`,
            href: scopedSede && scopedSede !== "FITNESS_CENTER" ? undefined : link({ sede: "FITNESS_CENTER", status: "ACTIVE,TRIAL" }),
          },
          {
            label: "Xtreme",
            value: statsXT.active + statsXT.trial,
            hint: `${statsXT.active} activos · ${statsXT.trial} en evaluación`,
            href: scopedSede && scopedSede !== "XTREME" ? undefined : link({ sede: "XTREME", status: "ACTIVE,TRIAL" }),
          },
          {
            label: "Total ambas sedes",
            value: statsFC.active + statsFC.trial + statsXT.active + statsXT.trial,
            hint: "Activos + en evaluación",
            href: scopedSede ? undefined : link({ status: "ACTIVE,TRIAL" }),
          },
          { label: "Bajas", value: statsFC.churned + statsXT.churned, hint: "Histórico", href: link({ status: "CHURNED" }) },
        ]}
      />

      <div className="border-t border-border bg-card">
        <FilterBar filters={filters} searchPlaceholder="Buscar nombre, correo, teléfono" />
        <MemberTable members={result.members} />
        <Pager page={result.page} totalPages={result.totalPages} total={result.total} noun="socios" />
      </div>
    </div>
  );
}
