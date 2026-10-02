import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ecuadorDateString } from "@/lib/timezone";
import { InvoiceEditor, type EditorPayment } from "./invoice-editor";

export const dynamic = "force-dynamic";

export default async function NuevaFacturaPage({
  searchParams,
}: {
  searchParams: Promise<{ socio?: string; pago?: string }>;
}) {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  const params = await searchParams;
  const scope = getSedeScope(user);

  const [members, saleItems, points, payment] = await Promise.all([
    prisma.member.findMany({
      where: { status: { not: "LEAD" } },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, address: true, sede: true, taxIdType: true, taxId: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    prisma.saleItem.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.emissionPoint.findMany({ where: { active: true }, orderBy: [{ sede: "asc" }, { establishment: "asc" }, { point: "asc" }] }),
    params.pago
      ? prisma.payment.findUnique({
          where: { id: params.pago },
          include: { invoice: { select: { status: true } } },
        })
      : null,
  ]);

  let existing: EditorPayment | null = null;
  if (payment && !payment.isPoolEntry && (!payment.invoice || payment.invoice.status === "VOIDED")) {
    existing = {
      id: payment.id,
      sede: payment.sede,
      memberId: payment.memberId,
      membershipId: payment.membershipId,
      amountCents: payment.amountCents,
      method: payment.method,
      paidAt: (payment.paidAt ?? payment.createdAt).toISOString().slice(0, 10),
      bankReference: payment.bankReference,
    };
  }

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/dashboard/facturas" className="text-sm text-muted-foreground hover:underline">
            ← Facturación
          </Link>
          <h1 className="text-2xl font-semibold">{existing ? "Facturar un cobro" : "Cobrar y facturar"}</h1>
        </div>
      </div>
      {payment && !existing && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Ese cobro ya tiene una factura vigente o no se puede facturar. Puedes hacer una factura nueva abajo.
        </p>
      )}
      <InvoiceEditor
        members={members}
        saleItems={saleItems.map((s) => ({ id: s.id, sede: s.sede, name: s.name, priceCents: s.priceCents, ivaRate: s.ivaRate, incomeAccountCode: s.incomeAccountCode }))}
        points={points.map((p) => ({ id: p.id, sede: p.sede, establishment: p.establishment, point: p.point, address: p.address, lastSequential: p.lastSequential, environment: p.environment }))}
        defaultSede={existing?.sede ?? scope ?? "FITNESS_CENTER"}
        defaultMemberId={existing?.memberId ?? params.socio ?? null}
        existingPayment={existing}
        today={ecuadorDateString()}
      />
    </div>
  );
}
