import Link from "next/link";
import { Sede } from "@/generated/prisma/client";
import { getMembers, getMemberStats } from "@/lib/actions/members";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { MemberTable } from "./member-table";
import { MemberFilters } from "./member-filters";

export const dynamic = "force-dynamic";

export default async function SociosPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string; status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const sede = params.sede as Sede | undefined;
  const status = params.status as any;
  const search = params.q;
  const page = parseInt(params.page ?? "1", 10);

  const [result, statsFC, statsXT] = await Promise.all([
    getMembers({ sede, status, search, page }),
    getMemberStats(Sede.FITNESS_CENTER),
    getMemberStats(Sede.XTREME),
  ]);

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Socios</h1>
          <p className="text-sm text-muted-foreground">
            Gestión de miembros — alta, baja, membresías y seguimiento.
          </p>
        </div>
        <Link href="/dashboard/socios/nuevo" className={buttonVariants({ size: "sm" })}>
          + Nuevo socio
        </Link>
      </header>

      {/* Stats cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fitness Center</CardDescription>
            <CardTitle className="text-2xl">{statsFC.active + statsFC.trial}</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-1.5 flex-wrap">
            <Badge variant="outline">{statsFC.active} activos</Badge>
            <Badge variant="outline">{statsFC.trial} trial</Badge>
            {statsFC.churned > 0 && <Badge variant="destructive">{statsFC.churned} bajas</Badge>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Xtreme</CardDescription>
            <CardTitle className="text-2xl">{statsXT.active + statsXT.trial}</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-1.5 flex-wrap">
            <Badge variant="outline">{statsXT.active} activos</Badge>
            <Badge variant="outline">{statsXT.trial} trial</Badge>
            {statsXT.churned > 0 && <Badge variant="destructive">{statsXT.churned} bajas</Badge>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total ambas sedes</CardDescription>
            <CardTitle className="text-2xl">
              {statsFC.active + statsFC.trial + statsXT.active + statsXT.trial}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Socios activos + trial
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bajas totales</CardDescription>
            <CardTitle className="text-2xl">{statsFC.churned + statsXT.churned}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Histórico de cancelaciones
          </CardContent>
        </Card>
      </section>

      {/* Filters */}
      <MemberFilters currentSede={sede} currentStatus={status} currentSearch={search} />

      {/* Table */}
      <MemberTable
        members={result.members}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
      />
    </div>
  );
}
