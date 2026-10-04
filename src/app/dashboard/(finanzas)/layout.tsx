import { ReactNode, Suspense } from "react";
import { requireAuth, can } from "@/lib/auth";
import { FinanceNav } from "./finance-nav";

// Finanzas, Facturación, Gastos y Contabilidad viven bajo un solo menú
// (Santiago, 2 oct 2026), organizado por módulos como QuickBooks (4 oct 2026)
// sobre fondo blanco. Admins only reach Gastos and get no sub-navigation.
export default async function FinanceLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) return <>{children}</>;
  return (
    <div className="min-h-[calc(100vh-2.75rem)] bg-white">
      <Suspense fallback={<div className="h-[5.5rem] border-b" />}>
        <FinanceNav />
      </Suspense>
      {children}
    </div>
  );
}
