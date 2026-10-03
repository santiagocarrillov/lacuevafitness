import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { safeBack } from "@/lib/safe-back";
import { TargetsForm } from "../targets-form";
import type { Sede } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const MES_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const SEDE_LABEL: Record<Sede, string> = { FITNESS_CENTER: "Fitness Center", XTREME: "Xtreme" };

export default async function MetasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; sede?: string; volver?: string }>;
}) {
  const user = await requireAuth();
  if (!can.viewReports(user)) redirect("/dashboard?forbidden=1");
  const params = await searchParams;
  const scope = getSedeScope(user);

  const now = new Date();
  const m = params.mes ? MES_RE.exec(params.mes) : null;
  const year = m ? Number(m[1]) : now.getFullYear();
  const month = m ? Number(m[2]) : now.getMonth() + 1;
  const mes = `${year}-${String(month).padStart(2, "0")}`;
  const monthLabel = new Date(year, month - 1).toLocaleDateString("es-EC", { month: "long", year: "numeric" });

  // A sede-scoped admin only edits their own sede's targets.
  const sede: Sede | null =
    scope ?? (params.sede === "FITNESS_CENTER" || params.sede === "XTREME" ? params.sede : null);
  const back = safeBack(params.volver, `/dashboard/reportes?tab=gestion${sede ? `&sede=${sede}` : ""}&year=${year}&month=${month}`);

  if (!sede) {
    // Targets are per sede: pick one first.
    return (
      <FormPage title={`Metas — ${monthLabel}`} description="Las metas se definen por sede. Elige una.">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SEDE_LABEL) as Sede[]).map((s) => {
            const sp = new URLSearchParams({ mes, sede: s, volver: back });
            return (
              <Link
                key={s}
                href={`/dashboard/reportes/metas?${sp.toString()}`}
                className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent"
              >
                {SEDE_LABEL[s]}
              </Link>
            );
          })}
        </div>
      </FormPage>
    );
  }

  const current = await prisma.monthlyTarget.findUnique({
    where: { sede_year_month: { sede, year, month } },
    select: {
      revenueTargetCents: true,
      salesTarget: true,
      visitorsTarget: true,
      leadsTarget: true,
      attendanceTarget: true,
      workingDays: true,
      projectedICVPct: true,
    },
  });

  return (
    <FormPage title={`Metas — ${monthLabel}`} description={`Sede: ${SEDE_LABEL[sede]}`}>
      <TargetsForm key={`${sede}-${mes}`} sede={sede} year={year} month={month} current={current} backHref={back} />
    </FormPage>
  );
}
