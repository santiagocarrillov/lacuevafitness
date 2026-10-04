import Link from "next/link";
import type { ExpenseCategory, OtherIncomeCategory, Sede } from "@/generated/prisma/enums";
import { getCapitalBalances, getFinanceTrend, getIncomeStatement } from "@/lib/actions/finance";
import type { EntityStatement } from "@/lib/finance/queries";
import {
  ENTITIES,
  EXPENSE_CATEGORY_LABELS,
  OTHER_INCOME_LABELS,
  fmtMoney,
  monthLabel,
} from "@/lib/finance/entities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Line = {
  label: string;
  values: number[]; // one per entity
  kind?: "section" | "total" | "result" | "muted" | "warn";
  /** Where a value goes when clicked (null = consolidated column). */
  link?: (sede: Sede | null) => string;
};

function resultClass(cents: number) {
  return cents > 0 ? "text-emerald-700" : cents < 0 ? "text-red-700" : "";
}

function buildLines(st: EntityStatement[], ym: string): Line[] {
  const ent = (sede: Sede | null) => (sede ? `&entidad=${sede}` : "");
  const gastos = (extra: string) => (sede: Sede | null) => `/dashboard/gastos?mes=${ym}${ent(sede)}${extra}`;
  const contab = (sede: Sede | null, tab: string) => `/dashboard/contabilidad?tab=${tab}&mes=${ym}&entidad=${sede ?? "XTREME"}`;
  const v = (f: (s: EntityStatement) => number) => st.map(f);
  const otherCats = [...new Set(st.flatMap((s) => s.otherIncome.map((o) => o.category)))] as OtherIncomeCategory[];
  const expCats = [...new Set(st.flatMap((s) => s.expenses.map((e) => e.category)))] as ExpenseCategory[];
  // Order expense categories by consolidated amount.
  const expTotal = (c: ExpenseCategory) =>
    st.reduce((sum, s) => sum + (s.expenses.find((e) => e.category === c)?.cents ?? 0), 0);
  expCats.sort((a, b) => expTotal(b) - expTotal(a));

  const lines: Line[] = [
    { label: "Ingresos", values: [], kind: "section" },
    { label: "Membresías confirmadas", values: v((s) => s.membershipsConfirmedCents), link: (sede) => contab(sede, "estados") },
    { label: "Membresías sin conciliar con el banco", values: v((s) => s.membershipsUnreconciledCents), kind: "warn", link: () => "/dashboard/finanzas/banco/conciliar" },
  ];
  if (st.some((s) => s.unassignedDepositsCents)) {
    lines.push({ label: "Depósitos sin asignar a un socio", values: v((s) => s.unassignedDepositsCents), kind: "warn", link: () => "/dashboard/pagos" });
  }
  for (const c of otherCats) {
    lines.push({
      label: OTHER_INCOME_LABELS[c],
      values: v((s) => s.otherIncome.find((o) => o.category === c)?.cents ?? 0),
      link: () => `/dashboard/finanzas/otros-ingresos?mes=${ym}`,
    });
  }
  lines.push({ label: "Total ingresos", values: v((s) => s.incomeCents), kind: "total", link: (sede) => contab(sede, "estados") });

  lines.push({ label: "Gastos", values: [], kind: "section" });
  if (expCats.length === 0) lines.push({ label: "Sin gastos registrados", values: v(() => 0), kind: "muted" });
  for (const c of expCats) {
    lines.push({
      label: EXPENSE_CATEGORY_LABELS[c],
      values: v((s) => s.expenses.find((e) => e.category === c)?.cents ?? 0),
      link: gastos(`&categoria=${c}`),
    });
  }
  lines.push({ label: "Total gastos", values: v((s) => s.expensesCents), kind: "total", link: gastos("") });
  lines.push({ label: "Gastos con factura (deducibles)", values: v((s) => s.deductibleCents), kind: "muted", link: gastos("&doc=FACTURA") });
  lines.push({ label: "Resultado del mes", values: v((s) => s.resultCents), kind: "result", link: (sede) => contab(sede, "estados") });

  lines.push({ label: "Dinero de los dueños", values: [], kind: "section" });
  lines.push({ label: "Aportes y préstamos recibidos", values: v((s) => s.capitalInCents), link: () => `/dashboard/finanzas/aportes?mes=${ym}` });
  lines.push({ label: "Devoluciones y retiros", values: v((s) => s.capitalOutCents), link: () => `/dashboard/finanzas/aportes?mes=${ym}` });
  lines.push({ label: "Cuentas por pagar (todas las fechas)", values: v((s) => s.payablesCents), kind: "muted", link: (sede) => `/dashboard/gastos?ver=porpagar${ent(sede)}` });
  return lines;
}

export async function ResumenTab({ ym }: { ym: string }) {
  const [statement, trend, balances] = await Promise.all([
    getIncomeStatement(ym),
    getFinanceTrend(ym, 12),
    getCapitalBalances(),
  ]);
  const lines = buildLines(statement, ym);
  const noExpenses = statement.every((s) => s.expensesCents === 0);
  const unreconciled = statement.reduce((s, x) => s + x.membershipsUnreconciledCents, 0);

  return (
    <div className="space-y-6">
      {(noExpenses || unreconciled > 0) && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-1">
          {noExpenses && (
            <p>
              <strong>No hay gastos registrados en {monthLabel(ym)}.</strong> El resultado solo refleja ingresos.
              Los gastos llegarán del estado de cuenta y del SRI; lo pagado en efectivo se registra en{" "}
              <Link href={`/dashboard/gastos?mes=${ym}`} className="underline">Gastos</Link>.
            </p>
          )}
          {unreconciled > 0 && (
            <p>
              {fmtMoney(unreconciled)} en membresías están registradas por recepción pero aún no se cuadran con el
              banco (<Link href="/dashboard/pagos" className="underline">Pagos</Link>).
            </p>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="capitalize">Estado de resultados · {monthLabel(ym)}</CardTitle>
          <CardDescription>
            Ingresos por fecha de pago; gastos por fecha del documento. El dinero de los dueños no es ingreso: va aparte.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left font-medium py-2 pr-4">Concepto</th>
                {statement.map((s) => (
                  <th key={s.sede} className="text-right font-medium py-2 px-3 whitespace-nowrap">
                    {ENTITIES[s.sede].name.replace("La Cueva ", "")}
                  </th>
                ))}
                <th className="text-right font-medium py-2 pl-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                if (l.kind === "section") {
                  return (
                    <tr key={i}>
                      <td colSpan={statement.length + 2} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {l.label}
                      </td>
                    </tr>
                  );
                }
                const total = l.values.reduce((a, b) => a + b, 0);
                const rowCls =
                  l.kind === "total" ? "border-t font-medium"
                  : l.kind === "result" ? "border-t-2 font-semibold"
                  : l.kind === "muted" ? "text-muted-foreground text-xs"
                  : l.kind === "warn" ? "text-amber-700" : "";
                const cell = (c: number) =>
                  `text-right tabular-nums py-1.5 px-3 ${l.kind === "result" ? resultClass(c) : ""}`;
                return (
                  <tr key={i} className={rowCls}>
                    <td className="py-1.5 pr-4">{l.label}</td>
                    {l.values.map((c, j) => (
                      <td key={j} className={cell(c)}>
                        {l.link && c !== 0 ? <Link href={l.link(statement[j].sede)} className="hover:underline">{fmtMoney(c)}</Link> : fmtMoney(c)}
                      </td>
                    ))}
                    <td className={`${cell(total)} pl-3 pr-0`}>
                      {l.link && total !== 0 ? <Link href={l.link(null)} className="hover:underline">{fmtMoney(total)}</Link> : fmtMoney(total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Últimos 12 meses</CardTitle>
          <CardDescription>Resultado por entidad y cuánto pusieron (o sacaron) los dueños cada mes.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left font-medium py-2 pr-4">Mes</th>
                <th className="text-right font-medium py-2 px-2">Ingresos F</th>
                <th className="text-right font-medium py-2 px-2">Gastos F</th>
                <th className="text-right font-medium py-2 px-2">Resultado F</th>
                <th className="text-right font-medium py-2 px-2">Ingresos X</th>
                <th className="text-right font-medium py-2 px-2">Gastos X</th>
                <th className="text-right font-medium py-2 px-2">Resultado X</th>
                <th className="text-right font-medium py-2 pl-2">Dueños (neto)</th>
              </tr>
            </thead>
            <tbody>
              {[...trend].reverse().map((r) => {
                const f = r.bySede.FITNESS_CENTER;
                const x = r.bySede.XTREME;
                const fr = f.incomeCents - f.expensesCents;
                const xr = x.incomeCents - x.expensesCents;
                const cap = f.capitalNetCents + x.capitalNetCents;
                return (
                  <tr key={r.ym} className={`border-b last:border-0 ${r.ym === ym ? "bg-accent" : ""}`}>
                    <td className="py-1.5 pr-4 capitalize">
                      <Link href={`/dashboard/finanzas/reportes/resultados?mes=${r.ym}`} className="hover:underline">
                        {monthLabel(r.ym)}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums px-2">{fmtMoney(f.incomeCents)}</td>
                    <td className="text-right tabular-nums px-2">{fmtMoney(f.expensesCents)}</td>
                    <td className={`text-right tabular-nums px-2 font-medium ${resultClass(fr)}`}>{fmtMoney(fr)}</td>
                    <td className="text-right tabular-nums px-2">{fmtMoney(x.incomeCents)}</td>
                    <td className="text-right tabular-nums px-2">{fmtMoney(x.expensesCents)}</td>
                    <td className={`text-right tabular-nums px-2 font-medium ${resultClass(xr)}`}>{fmtMoney(xr)}</td>
                    <td className="text-right tabular-nums pl-2">{cap ? fmtMoney(cap) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saldo de los dueños con cada entidad</CardTitle>
          <CardDescription>
            Acumulado histórico. En la S.A.S., el préstamo neto es lo que la empresa le debe a cada accionista.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay aportes registrados.{" "}
              <Link href={`/dashboard/finanzas/aportes?mes=${ym}`} className="text-primary hover:underline">
                Registrar el primero
              </Link>
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left font-medium py-2 pr-4">Entidad</th>
                  <th className="text-left font-medium py-2 pr-4">Persona</th>
                  <th className="text-right font-medium py-2 px-3">Aportes</th>
                  <th className="text-right font-medium py-2 px-3">Préstamo neto</th>
                  <th className="text-right font-medium py-2 pl-3">Retiros</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={`${b.sede}|${b.person}`} className="border-b last:border-0">
                    <td className="py-1.5 pr-4">{ENTITIES[b.sede].name}</td>
                    <td className="py-1.5 pr-4">{b.person}</td>
                    <td className="text-right tabular-nums px-3">{fmtMoney(b.contributedCents)}</td>
                    <td className="text-right tabular-nums px-3">{fmtMoney(b.loanedCents)}</td>
                    <td className="text-right tabular-nums pl-3">{fmtMoney(b.withdrawnCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
