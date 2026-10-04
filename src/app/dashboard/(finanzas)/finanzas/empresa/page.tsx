import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Building2, CircleAlert, Landmark, ListTree, Lock, Users } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENTITIES, ENTITY_ORDER } from "@/lib/finance/entities";
import { lockedThrough } from "@/lib/accounting/posting";
import { certStatus } from "@/lib/invoicing/emit";
import { sriDueDay } from "@/lib/taxes/calendar";
import { PageHeader } from "../../page-header";

export const dynamic = "force-dynamic";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 border-b py-2 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export default async function EmpresaPage() {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");

  const data = await Promise.all(
    ENTITY_ORDER.map(async (sede) => {
      const [locked, cert, points, accounts, banks] = await Promise.all([
        lockedThrough(prisma, sede),
        certStatus(sede),
        prisma.emissionPoint.findMany({ where: { sede, active: true }, orderBy: [{ establishment: "asc" }, { point: "asc" }] }),
        prisma.ledgerAccount.count({ where: { sede, active: true, postable: true } }),
        prisma.bankAccount.findMany({ where: { sede, active: true }, select: { id: true, name: true, last4: true } }),
      ]);
      return { sede, locked, cert, points, accounts, banks };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Empresa" subtitle="Las empresas que lleva esta contabilidad: datos del RUC, firma electrónica, plan de cuentas y cierre." />

      <div className="grid gap-5 lg:grid-cols-2">
        {data.map(({ sede, locked, cert, points, accounts, banks }) => {
          const e = ENTITIES[sede];
          const day = sriDueDay(e.ruc);
          return (
            <section key={sede} className="rounded-xl border border-stone-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-stone-900 text-white">
                  <Building2 className="size-5" />
                </span>
                <div>
                  <h2 className="font-semibold">{e.name}</h2>
                  <p className="text-sm text-muted-foreground">{e.legalName}</p>
                </div>
              </div>
              <dl>
                <Row label="Tipo">{e.kind === "SAS" ? "Sociedad (S.A.S.)" : "Persona natural"}</Row>
                <Row label="RUC">{e.ruc ?? <span className="text-amber-700">Por confirmar</span>}</Row>
                <Row label="Contabilidad">{e.accountingRequired ? "Obligada a llevar contabilidad" : "No obligada a llevar contabilidad"}</Row>
                <Row label="Declara el día">{day ? `${day} de cada mes (noveno dígito del RUC)` : "—"}</Row>
                <Row label={e.kind === "SAS" ? "Accionistas" : "Dueños"}>
                  <span className="inline-flex items-center gap-1.5"><Users className="size-3.5 text-muted-foreground" />{e.owners.join(" · ")}</span>
                </Row>
                <Row label="Firma electrónica">
                  {cert.ready ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700"><BadgeCheck className="size-4" />Lista · vence {cert.validUntil}</span>
                  ) : (
                    <Link href="/dashboard/facturas?tab=config" className="inline-flex items-center gap-1.5 text-amber-700 hover:underline">
                      <CircleAlert className="size-4" />
                      {!cert.uploaded ? "Falta subir la .p12" : !cert.passwordSet ? "Falta la clave en Vercel" : "No se pudo leer"}
                    </Link>
                  )}
                </Row>
                <Row label="Puntos de emisión">
                  {points.length ? points.map((p) => `${p.establishment}-${p.point} (${p.environment === "PRUEBAS" ? "pruebas" : "producción"})`).join(" · ") : <span className="text-muted-foreground">Ninguno</span>}
                </Row>
                <Row label="Bancos">
                  {banks.length ? (
                    banks.map((b, i) => (
                      <span key={b.id}>
                        {i > 0 && " · "}
                        <Link href={`/dashboard/finanzas/banco/movimientos?cuenta=${b.id}`} className="hover:underline">{b.name}{b.last4 ? ` ··${b.last4}` : ""}</Link>
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground">Ninguno</span>
                  )}
                </Row>
              </dl>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <Link href={`/dashboard/contabilidad?tab=plan&entidad=${sede}`} className="rounded-lg border p-2.5 hover:bg-stone-50">
                  <ListTree className="mx-auto mb-1 size-4 text-muted-foreground" />
                  {accounts} cuentas
                </Link>
                <Link href={`/dashboard/contabilidad?tab=diario&entidad=${sede}`} className="rounded-lg border p-2.5 hover:bg-stone-50">
                  <Lock className="mx-auto mb-1 size-4 text-muted-foreground" />
                  {locked ? `Cerrado al ${locked.toISOString().slice(0, 10)}` : "Sin meses cerrados"}
                </Link>
                <Link href={`/dashboard/contabilidad?tab=estados&entidad=${sede}`} className="rounded-lg border p-2.5 hover:bg-stone-50">
                  <Landmark className="mx-auto mb-1 size-4 text-muted-foreground" />
                  Estados financieros
                </Link>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
