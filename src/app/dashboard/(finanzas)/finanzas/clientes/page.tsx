import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, HandCoins, Receipt, Users } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENTITIES, fmtMoney, monthRangeUtc } from "@/lib/finance/entities";
import { parseEntityView, type EntityView } from "@/lib/finance/home";
import { EntityPills, MonthNav, PageHeader } from "../../page-header";
import { BarList, Panel, Stat } from "../../blocks";
import { monthParam } from "../month";

export const dynamic = "force-dynamic";

const TEAL = "#0f9f8f";
const METHOD_LABEL: Record<string, string> = {
  STRIPE_CARD: "Tarjeta",
  STRIPE_LINK: "Link de pago",
  BANK_TRANSFER: "Transferencia",
  CASH: "Efectivo",
  PLUX_CARD: "Tarjeta (Plux)",
  OTHER: "Otro",
};

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ mes?: string; entidad?: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const params = await searchParams;
  const { ym, thisMonth } = monthParam(params.mes);
  const view = parseEntityView(params.entidad);
  const sedes = view === "ALL" ? (["FITNESS_CENTER", "XTREME"] as const) : [view];
  const href = (u: { mes?: string; entidad?: EntityView }) => {
    const q = new URLSearchParams({ mes: u.mes ?? ym });
    const e = u.entidad ?? view;
    if (e !== "ALL") q.set("entidad", e);
    return `/dashboard/finanzas/clientes?${q}`;
  };
  const { start, end } = monthRangeUtc(ym);

  const [payments, invoices] = await Promise.all([
    prisma.payment.findMany({
      where: {
        sede: { in: [...sedes] },
        isPoolEntry: false,
        memberId: { not: null },
        status: { in: ["SUCCEEDED", "PENDING"] },
        paidAt: { gte: start, lt: end },
      },
      select: {
        id: true,
        amountCents: true,
        method: true,
        status: true,
        paidAt: true,
        sede: true,
        invoiceId: true,
        invoice: { select: { status: true } },
        member: { select: { id: true, firstName: true, lastName: true } },
        membership: { select: { plan: { select: { name: true } } } },
      },
      orderBy: { paidAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: { sede: { in: [...sedes] }, issueDate: { gte: start, lt: end }, status: { not: "VOIDED" } },
      select: { totalCents: true, status: true },
    }),
  ]);

  const total = payments.reduce((a, p) => a + p.amountCents, 0);
  const members = new Set(payments.map((p) => p.member?.id)).size;
  const uninvoiced = payments.filter((p) => !p.invoiceId || p.invoice?.status === "VOIDED").length;
  const invoiced = invoices.reduce((a, i) => a + i.totalCents, 0);
  const authorized = invoices.filter((i) => i.status === "AUTHORIZED").length;

  const group = (key: (p: (typeof payments)[number]) => string) => {
    const m = new Map<string, number>();
    for (const p of payments) m.set(key(p), (m.get(key(p)) ?? 0) + p.amountCents);
    return [...m].map(([label, cents]) => ({ label, cents })).sort((a, b) => b.cents - a.cents);
  };
  const byPlan = group((p) => p.membership?.plan.name ?? "Sin plan asociado");
  const byMethod = group((p) => METHOD_LABEL[p.method] ?? p.method);
  const bySede = view === "ALL" ? group((p) => ENTITIES[p.sede].name) : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Clientes" subtitle="Lo que pagan los socios, cómo pagan y qué falta facturar al SRI.">
        <EntityPills view={view} href={(v) => href({ entidad: v })} />
        <MonthNav ym={ym} thisMonth={thisMonth} href={(m) => href({ mes: m })} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cobrado a socios" value={fmtMoney(total)} sub={`${payments.length} cobros`} href={`/dashboard/pagos?mes=${ym}${view !== "ALL" ? `&sede=${view}` : ""}`} icon={HandCoins} color={TEAL} />
        <Stat label="Socios que pagaron" value={String(members)} sub={members ? `Ticket promedio ${fmtMoney(Math.round(total / members))}` : undefined} href="/dashboard/socios" icon={Users} color="#6b4fb5" />
        <Stat label="Facturado al SRI" value={fmtMoney(invoiced)} sub={`${authorized} de ${invoices.length} autorizadas`} href={`/dashboard/facturas?mes=${ym}`} icon={FileText} color="#2f6fb0" />
        <Stat
          label="Cobros sin factura"
          value={String(uninvoiced)}
          sub={uninvoiced ? "Se factura al cobrar" : "Todo facturado"}
          href={`/dashboard/facturas?mes=${ym}`}
          icon={Receipt}
          color={uninvoiced ? "#e5533f" : "#0f9f8f"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Ventas por plan" className="lg:col-span-2">
          <BarList rows={byPlan.map((r) => ({ ...r, href: `/dashboard/pagos?mes=${ym}${view !== "ALL" ? `&sede=${view}` : ""}` }))} color={TEAL} empty="Sin cobros este mes." />
        </Panel>
        <div className="space-y-5">
          <Panel title="Por forma de pago">
            <BarList rows={byMethod} color="#2f6fb0" empty="Sin cobros este mes." />
          </Panel>
          {bySede.length > 0 && (
            <Panel title="Por sede">
              <BarList rows={bySede} color="#6b4fb5" empty="—" />
            </Panel>
          )}
        </div>
      </div>

      <Panel title="Últimos cobros" aside={<Link href={`/dashboard/pagos?mes=${ym}${view !== "ALL" ? `&sede=${view}` : ""}`} className="text-[#2f6fb0] hover:underline">Ver todos ›</Link>}>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin cobros este mes.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium">Socio</th>
                <th className="hidden py-2 pr-3 font-medium md:table-cell">Plan</th>
                <th className="hidden py-2 pr-3 font-medium sm:table-cell">Forma</th>
                <th className="py-2 pr-3 font-medium">Factura</th>
                <th className="py-2 text-right font-medium">Monto</th>
              </tr>
            </thead>
            <tbody>
              {payments.slice(0, 15).map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-stone-50">
                  <td className="py-2 pr-3 tabular-nums text-muted-foreground">{p.paidAt?.toISOString().slice(5, 10)}</td>
                  <td className="py-2 pr-3">
                    {p.member ? (
                      <Link href={`/dashboard/socios/${p.member.id}`} className="font-medium hover:underline">
                        {p.member.firstName} {p.member.lastName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="hidden py-2 pr-3 text-muted-foreground md:table-cell">{p.membership?.plan.name ?? "—"}</td>
                  <td className="hidden py-2 pr-3 text-muted-foreground sm:table-cell">{METHOD_LABEL[p.method]}</td>
                  <td className="py-2 pr-3">
                    {p.invoiceId && p.invoice?.status !== "VOIDED" ? (
                      <Link href={`/dashboard/facturas/${p.invoiceId}`} className="text-xs text-[#2f6fb0] hover:underline">Ver factura</Link>
                    ) : (
                      <span className="text-xs text-amber-700">Sin factura</span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">{fmtMoney(p.amountCents, { decimals: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
