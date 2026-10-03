import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtUsd } from "@/lib/invoicing/core";
import { accumulatedThrough, chargeForMonth, monthIdx } from "@/lib/accounting/depreciation";
import { ecuadorDateString } from "@/lib/timezone";
import { FormPage } from "@/app/dashboard/form-page";
import { AssetForms } from "../../activos-actions";

export const dynamic = "force-dynamic";

export default async function ActivoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const a = await prisma.fixedAsset.findUnique({ where: { id }, include: { account: true, expenseLine: { select: { expenseId: true } } } });
  if (!a) notFound();
  const now = monthIdx(new Date(`${ecuadorDateString()}T00:00:00Z`));
  const acc = Math.min(a.costCents, accumulatedThrough(a, now));
  return (
    <FormPage
      title={a.name}
      description={
        <>
          {a.account.name} · costo {fmtUsd(a.costCents)} · depreciado {fmtUsd(acc)} · cuota {fmtUsd(chargeForMonth(a, Math.max(now, monthIdx(a.startsOn))))}/mes
          {a.expenseLine && (
            <>
              {" · "}
              <Link href={`/dashboard/gastos/${a.expenseLine.expenseId}`} className="text-primary hover:underline">ver la compra</Link>
            </>
          )}
        </>
      }
    >
      {a.disposedOn ? (
        <p className="text-sm">Dado de baja el {a.disposedOn.toISOString().slice(0, 10)}: {a.disposalNote}</p>
      ) : (
        <AssetForms id={a.id} sede={a.sede} name={a.name} usefulLifeMonths={a.usefulLifeMonths} residualCents={a.residualCents} />
      )}
    </FormPage>
  );
}
