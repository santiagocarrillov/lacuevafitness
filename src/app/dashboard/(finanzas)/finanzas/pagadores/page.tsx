import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtMoney } from "@/lib/finance/entities";
import { TAX_ID_LABELS } from "@/lib/invoicing/core";
import { SEARCH_SOURCES, idsMatching } from "@/lib/text-search";
import { PageHeader } from "../../page-header";

export const dynamic = "force-dynamic";

export default async function PagadoresPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireAuth();
  if (!can.viewPayments(user)) redirect("/dashboard?forbidden=1");
  const q = ((await searchParams).q ?? "").trim();
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

  // Accent-insensitive: by the payer's name/ID or by a member they pay for.
  const [payerIds, memberIds] = q
    ? await Promise.all([idsMatching(SEARCH_SOURCES.payer, q), idsMatching(SEARCH_SOURCES.memberName, q)])
    : [null, null];
  const payers = await prisma.payer.findMany({
    where: q ? { OR: [{ id: { in: payerIds ?? [] } }, { members: { some: { id: { in: memberIds ?? [] } } } }] } : {},
    orderBy: { name: "asc" },
    include: {
      members: { select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: "asc" } },
      invoices: { where: { status: { not: "VOIDED" }, issueDate: { gte: yearStart } }, select: { totalCents: true } },
    },
    take: 300,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Pagadores" subtitle="Quien paga por uno o varios socios y recibe la factura (p. ej. mamá o papá). Sus datos no van a la ficha del socio.">
        <Link href="/dashboard/finanzas/pagadores/nuevo" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0f9f8f] px-4 text-sm font-medium text-white hover:opacity-90">
          <Plus className="size-4" /> Nuevo pagador
        </Link>
      </PageHeader>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <form className="flex items-center gap-2 border-b px-4 py-2.5" action="/dashboard/finanzas/pagadores">
          <Search className="size-4 text-muted-foreground" />
          <input name="q" defaultValue={q} placeholder="Buscar por nombre, cédula o socio…" className="h-8 flex-1 bg-transparent text-sm outline-none" />
        </form>
        {payers.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {q ? "Ningún pagador coincide." : "Todavía no hay pagadores. Se crean desde la ficha del socio, al facturar a otra persona o aquí."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-stone-50/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Pagador</th>
                <th className="px-3 py-2.5 font-medium">Paga por</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Contacto</th>
                <th className="px-4 py-2.5 text-right font-medium">Facturado este año</th>
              </tr>
            </thead>
            <tbody>
              {payers.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/dashboard/finanzas/pagadores/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    <p className="text-xs text-muted-foreground">{TAX_ID_LABELS[p.taxIdType]} {p.taxId}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    {p.members.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      p.members.map((m, i) => (
                        <span key={m.id}>
                          {i > 0 && ", "}
                          <Link href={`/dashboard/socios/${m.id}`} className="hover:underline">{m.firstName} {m.lastName}</Link>
                        </span>
                      ))
                    )}
                  </td>
                  <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">{[p.email, p.phone].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(p.invoices.reduce((a, i) => a + i.totalCents, 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
