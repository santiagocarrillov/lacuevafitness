import Link from "next/link";
import { requireAuth, getSedeScope, can } from "@/lib/auth";
import {
  getMemberPayments,
  getPoolEntries,
  getPendingMemberPayments,
  getPaymentSummary,
} from "@/lib/actions/payments";
import { getMembers } from "@/lib/actions/members";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PoolEntryForm } from "./pool-form";
import { RegisterPaymentDialog } from "./register-payment-dialog";
import { ConfirmPaymentDialog } from "./confirm-payment-dialog";
import { DeleteButton } from "./delete-button";
import { deletePoolEntry, deletePendingPayment } from "@/lib/actions/payments";

export const dynamic = "force-dynamic";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia",
  STRIPE_CARD: "TC Stripe",
  STRIPE_LINK: "Stripe Link",
  OTHER: "Otro",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Fondos sin depositar",
  SUCCEEDED: "Confirmado",
  FAILED: "Fallido",
  REFUNDED: "Reembolsado",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "text-amber-700 bg-amber-50 border-amber-200",
  SUCCEEDED: "text-emerald-700 bg-emerald-50 border-emerald-200",
  FAILED: "text-red-700 bg-red-50 border-red-200",
  REFUNDED: "text-zinc-600 bg-zinc-100 border-zinc-200",
};

const SEDE_LABELS: Record<string, string> = {
  FITNESS_CENTER: "Fitness Center",
  XTREME: "Xtreme",
};

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC");
}

type Tab = "pagos" | "sin-asignar" | "ingresar";

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const user = await requireAuth();

  // Access control: OWNER, ACCOUNTING, ADMIN
  const allowed = user.role === "OWNER" || user.role === "ACCOUNTING" || user.role === "ADMIN";
  if (!allowed) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">No tienes acceso a esta sección.</p>
      </div>
    );
  }

  const scopedSede = getSedeScope(user);
  const isAccountingOrOwner = can.editFinancials(user);
  const defaultSede = user.sede ?? "FITNESS_CENTER";

  const params = await searchParams;
  const activeTab = (params.tab as Tab) ?? "pagos";
  const page = parseInt(params.page ?? "1", 10);

  // Load data for the active tab
  const [summary, paymentsData, poolEntries, pendingPayments, membersData] = await Promise.all([
    getPaymentSummary(scopedSede ?? undefined),
    activeTab === "pagos"
      ? getMemberPayments({ sede: scopedSede ?? undefined, page })
      : Promise.resolve({ payments: [], total: 0, page: 1, pageSize: 50, totalPages: 1 }),
    activeTab === "sin-asignar" || activeTab === "pagos"
      ? getPoolEntries(scopedSede ?? undefined)
      : Promise.resolve([]),
    activeTab === "sin-asignar" || activeTab === "pagos"
      ? getPendingMemberPayments(scopedSede ?? undefined)
      : Promise.resolve([]),
    // Load members for the register dialog (admins + owner need this)
    getMembers({ sede: scopedSede ?? undefined, status: "ACTIVE", pageSize: 500 }),
  ]);

  const members = membersData.members.map((m) => ({
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
  }));

  const tabs = [
    { key: "pagos", label: "Pagos registrados" },
    { key: "sin-asignar", label: `Sin asignar${summary.poolCount > 0 ? ` (${summary.poolCount})` : ""}` },
    ...(isAccountingOrOwner ? [{ key: "ingresar", label: "Ingresar del banco" }] : []),
  ];

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Pagos</h1>
          <p className="text-sm text-muted-foreground">
            Registro de cobros, transferencias y confirmación de pagos.
            {scopedSede && ` · ${SEDE_LABELS[scopedSede]}`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <RegisterPaymentDialog
            members={members}
            defaultSede={defaultSede}
            canPickSede={isAccountingOrOwner}
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Cobrado este mes</p>
            <p className="text-2xl font-semibold">{fmt(summary.monthTotalCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Fondos sin depositar</p>
            <p className={`text-2xl font-semibold ${summary.pendingCount > 0 ? "text-amber-600" : ""}`}>
              {summary.pendingCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Sin asignar (banco)</p>
            <p className={`text-2xl font-semibold ${summary.poolCount > 0 ? "text-amber-600" : ""}`}>
              {summary.poolCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/pagos?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${
              activeTab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* ── Tab: Pagos registrados ──────────────────────────────────────────── */}
      {activeTab === "pagos" && (
        <div className="space-y-4">
          {paymentsData.payments.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No hay pagos registrados aún.
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left font-medium px-3 py-2">Fecha</th>
                      <th className="text-left font-medium px-3 py-2">Socio</th>
                      <th className="text-left font-medium px-3 py-2">Membresía</th>
                      <th className="text-left font-medium px-3 py-2">Método</th>
                      <th className="text-right font-medium px-3 py-2">Monto</th>
                      <th className="text-left font-medium px-3 py-2">Estado</th>
                      <th className="text-left font-medium px-3 py-2">Depositante</th>
                      <th className="text-left font-medium px-3 py-2">Referencia</th>
                      <th className="text-left font-medium px-3 py-2">Banco</th>
                      {isAccountingOrOwner && (
                        <th className="text-left font-medium px-3 py-2">Sede</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paymentsData.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(p.paidAt ?? p.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          {p.member ? (
                            <Link
                              href={`/dashboard/socios/${p.member.id}`}
                              className="hover:underline text-primary"
                            >
                              {p.member.firstName} {p.member.lastName}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {p.membership?.plan?.name ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {METHOD_LABELS[p.method] ?? p.method}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {fmt(p.amountCents)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant="outline"
                            className={`text-xs ${STATUS_COLORS[p.status] ?? ""}`}
                          >
                            {STATUS_LABELS[p.status] ?? p.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {p.depositorName ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground font-mono">
                          {p.bankReference ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {p.bankEntity ?? "—"}
                        </td>
                        {isAccountingOrOwner && (
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {SEDE_LABELS[p.sede] ?? p.sede}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {paymentsData.totalPages > 1 && (
                <div className="flex items-center gap-2 text-sm">
                  {page > 1 && (
                    <Link href={`/dashboard/pagos?tab=pagos&page=${page - 1}`} className="text-primary hover:underline">
                      ← Anterior
                    </Link>
                  )}
                  <span className="text-muted-foreground">
                    Página {page} de {paymentsData.totalPages} · {paymentsData.total} pagos
                  </span>
                  {page < paymentsData.totalPages && (
                    <Link href={`/dashboard/pagos?tab=pagos&page=${page + 1}`} className="text-primary hover:underline">
                      Siguiente →
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Sin asignar (Isabel's pool) ───────────────────────────────── */}
      {activeTab === "sin-asignar" && (
        <div className="space-y-6">
          {/* Fondos sin depositar (admin's pending member payments) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                ⏳ Fondos sin depositar
                <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200">
                  {pendingPayments.length}
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Pagos de socios registrados por admin pero aún no confirmados en el banco.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {pendingPayments.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">Sin fondos pendientes.</p>
              ) : (
                <div className="divide-y">
                  {pendingPayments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div className="space-y-0.5">
                        <p className="font-medium">
                          {p.member?.firstName} {p.member?.lastName}
                          {p.membership && (
                            <span className="text-xs text-muted-foreground ml-2">
                              · {p.membership.plan.name}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {METHOD_LABELS[p.method] ?? p.method}
                          {p.depositorName && ` · ${p.depositorName}`}
                          {p.bankReference && ` · Ref: ${p.bankReference}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold tabular-nums">{fmt(p.amountCents)}</span>
                        <ConfirmPaymentDialog
                          payment={{
                            id: p.id,
                            amountCents: p.amountCents,
                            method: p.method,
                            member: p.member
                              ? { firstName: p.member.firstName, lastName: p.member.lastName }
                              : null,
                            membership: p.membership
                              ? { plan: { name: p.membership.plan.name } }
                              : null,
                          }}
                          poolEntries={poolEntries.map((pe) => ({
                            id: pe.id,
                            paidAt: pe.paidAt,
                            depositorName: pe.depositorName,
                            bankReference: pe.bankReference,
                            bankEntity: pe.bankEntity,
                            amountCents: pe.amountCents,
                          }))}
                        />
                        {isAccountingOrOwner && (
                          <DeleteButton
                            action={deletePendingPayment.bind(null, p.id)}
                            label="eliminar"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Isabel's pool (bank entries not yet matched) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                🏦 Pagos bancarios sin asignar
                <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200">
                  {poolEntries.length}
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Transferencias y pagos ingresados por Isabel que aún no están vinculados a un socio.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {poolEntries.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">
                  Sin registros bancarios pendientes.{" "}
                  {isAccountingOrOwner && (
                    <Link href="/dashboard/pagos?tab=ingresar" className="text-primary hover:underline">
                      Ingresar del banco →
                    </Link>
                  )}
                </p>
              ) : (
                <div className="divide-y">
                  {poolEntries.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div className="space-y-0.5">
                        <p className="font-medium">{p.depositorName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(p.paidAt)}
                          {p.bankEntity && ` · ${p.bankEntity}`}
                          {p.bankReference && ` · Ref: ${p.bankReference}`}
                          {isAccountingOrOwner && ` · ${SEDE_LABELS[p.sede] ?? p.sede}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold tabular-nums">{fmt(p.amountCents)}</span>
                        <Badge variant="outline" className="text-xs">
                          {METHOD_LABELS[p.method] ?? p.method}
                        </Badge>
                        {isAccountingOrOwner && (
                          <DeleteButton
                            action={deletePoolEntry.bind(null, p.id)}
                            label="eliminar"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tab: Ingresar del banco (Isabel) ────────────────────────────────── */}
      {activeTab === "ingresar" && isAccountingOrOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ingresar pagos del banco / Stripe</CardTitle>
            <p className="text-sm text-muted-foreground">
              Copia y pega desde el extracto bancario o Stripe. Los pagos guardados aparecerán en <strong>Sin asignar</strong>.
            </p>
          </CardHeader>
          <CardContent>
            <PoolEntryForm
              defaultSede={defaultSede}
              canPickSede={isAccountingOrOwner}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

