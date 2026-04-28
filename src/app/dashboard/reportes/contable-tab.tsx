import Link from "next/link";
import { Sede } from "@/generated/prisma/client";
import { getMonthlyFinancials, getExpensesByRange } from "@/lib/actions/reports";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { IngresosGastosChart } from "./ingresos-gastos-chart";
import { ExpensesPanel } from "./expenses-panel";

function fmt$(n: number) {
  return `$${n.toLocaleString("es-EC", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0); // day 0 = last day of previous month
  return d.toISOString().split("T")[0];
}

function firstDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export async function ContableTab({
  sede,
  from,
  to,
  buildUrl,
}: {
  sede?: Sede;
  from: string;
  to: string;
  buildUrl: (updates: Record<string, string>) => string;
}) {
  const [rows, expenses] = await Promise.all([
    getMonthlyFinancials(sede, 24),
    getExpensesByRange(sede, from, to),
  ]);

  // Derive year/month from "from" date for highlighting
  const fromDate = new Date(from + "T00:00:00");
  const year = fromDate.getFullYear();
  const month = fromDate.getMonth() + 1;

  const currentMonthRow = rows.find((r) => r.year === year && r.month === month);
  const totalRevenue = currentMonthRow?.revenue ?? 0;
  const totalExpenses = currentMonthRow?.expenses ?? 0;
  const utility = totalRevenue - totalExpenses;
  const profitability = totalRevenue > 0 ? (utility / totalRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Facturación mes</CardDescription>
            <CardTitle className="text-2xl">
              <Link
                href={buildUrl({ detail: "revenue" })}
                className="hover:underline cursor-pointer text-primary"
              >
                {fmt$(totalRevenue)}
              </Link>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gastos mes</CardDescription>
            <CardTitle className="text-2xl">{fmt$(totalExpenses)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Utilidad</CardDescription>
            <CardTitle className={`text-2xl ${utility >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {fmt$(utility)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rentabilidad</CardDescription>
            <CardTitle className={`text-2xl ${profitability >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {profitability.toFixed(1)}%
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      {/* Ingresos vs Gastos chart */}
      <Card>
        <CardHeader>
          <CardTitle>Ingresos vs Gastos (24 meses)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <IngresosGastosChart data={rows} />
        </CardContent>
      </Card>

      {/* Monthly table */}
      <Card>
        <CardHeader>
          <CardTitle>Tabla mensual</CardTitle>
          <CardDescription>Métricas clave por mes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Facturación</TableHead>
                  <TableHead className="text-right">Activos</TableHead>
                  <TableHead className="text-right">Ticket</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Bajas</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Gastos</TableHead>
                  <TableHead className="text-right">Utilidad</TableHead>
                  <TableHead className="text-right">Rent.%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const rowFrom = firstDayOfMonth(r.year, r.month);
                  const rowTo = lastDayOfMonth(r.year, r.month);
                  return (
                    <TableRow key={`${r.year}-${r.month}`} className={
                      r.year === year && r.month === month ? "bg-accent" : ""
                    }>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={buildUrl({ detail: "revenue", from: rowFrom, to: rowTo })}
                          className="hover:underline text-primary"
                        >
                          {fmt$(r.revenue)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">{r.activeMembers}</TableCell>
                      <TableCell className="text-right">{fmt$(r.ticketPromedio)}</TableCell>
                      <TableCell className="text-right">{r.sales}</TableCell>
                      <TableCell className="text-right">{r.churns}</TableCell>
                      <TableCell className="text-right">{r.leads}</TableCell>
                      <TableCell className="text-right">{fmt$(r.expenses)}</TableCell>
                      <TableCell className={`text-right ${r.utility >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {fmt$(r.utility)}
                      </TableCell>
                      <TableCell className={`text-right ${r.profitability >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {r.profitability.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Gastos del período (CRUD) */}
      <ExpensesPanel expenses={expenses} sede={sede} />
    </div>
  );
}
