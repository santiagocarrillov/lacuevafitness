import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ecuadorDateString } from "@/lib/timezone";
import { formatDocNumber } from "@/lib/invoicing/core";
import { InvoiceEditor, type EditorPayment, type SiblingPayment } from "./invoice-editor";

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

  const [members, saleItems, points, payment, payers] = await Promise.all([
    prisma.member.findMany({
      where: { status: { not: "LEAD" } },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, address: true, sede: true, taxIdType: true, taxId: true, payerId: true },
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
    prisma.payer.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, taxIdType: true, taxId: true, email: true, phone: true, address: true, members: { select: { firstName: true } } },
    }),
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
      depositorName: payment.depositorName,
      status: payment.status,
    };
  }

  // Other uninvoiced collections paid by the same person (the member's payer,
  // or the same depositor within ten days): they can go on one invoice.
  let siblings: SiblingPayment[] = [];
  if (existing && payment) {
    const payerOfMember = existing.memberId ? members.find((m) => m.id === existing.memberId)?.payerId ?? null : null;
    const or = [
      ...(payerOfMember ? [{ payerId: payerOfMember }, { member: { payerId: payerOfMember } }] : []),
      ...(payment.depositorName?.trim()
        ? [{
            // contains, not equals: front desk often leaves a trailing space.
            depositorName: { contains: payment.depositorName.trim(), mode: "insensitive" as const },
            paidAt: {
              gte: new Date((payment.paidAt ?? payment.createdAt).getTime() - 10 * 86_400_000),
              lte: new Date((payment.paidAt ?? payment.createdAt).getTime() + 10 * 86_400_000),
            },
          }]
        : []),
    ];
    if (or.length) {
      const rows = await prisma.payment.findMany({
        where: {
          id: { not: payment.id },
          sede: payment.sede,
          isPoolEntry: false,
          memberId: { not: null },
          status: { in: ["SUCCEEDED", "PENDING"] },
          OR: [{ invoiceId: null }, { invoice: { status: "VOIDED" } }],
          AND: [{ OR: or }],
        },
        include: { member: { select: { firstName: true, lastName: true } }, membership: { include: { plan: { select: { name: true, billingCycle: true } } } } },
        orderBy: { paidAt: "desc" },
        take: 10,
      });
      siblings = rows.map((r) => ({
        id: r.id,
        memberName: r.member ? `${r.member.firstName} ${r.member.lastName}` : "—",
        membershipId: r.membershipId,
        planName: r.membership?.plan.name ?? null,
        oneTime: r.membership?.plan.billingCycle === "ONE_TIME" || r.membership?.plan.billingCycle === "TRIAL",
        amountCents: r.amountCents,
        paidAt: (r.paidAt ?? r.createdAt).toISOString().slice(0, 10),
        confirmed: r.status === "SUCCEEDED",
      }));
    }
  }

  // Members whose membership was already invoiced this month (one per month
  // unless another confirmed collection backs a new invoice).
  const ym = ecuadorDateString().slice(0, 7);
  const monthStart = new Date(`${ym}-01T00:00:00Z`);
  const invoiced = await prisma.invoice.findMany({
    where: {
      memberId: { not: null },
      status: { not: "VOIDED" },
      issueDate: { gte: monthStart },
      lines: { some: { OR: [{ membershipId: { not: null } }, { incomeAccountCode: "4.1.01" }] } },
    },
    select: { memberId: true, sequential: true, emissionPoint: { select: { establishment: true, point: true } } },
  });
  const invoicedThisMonth = Object.fromEntries(
    invoiced.map((i) => [i.memberId!, formatDocNumber(i.emissionPoint.establishment, i.emissionPoint.point, i.sequential)]),
  );

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
        invoicedThisMonth={invoicedThisMonth}
        payers={payers.map((p) => ({ ...p, members: p.members.map((m) => m.firstName) }))}
        siblings={siblings}
      />
    </div>
  );
}
