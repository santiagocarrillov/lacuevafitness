import { ReactNode, Suspense } from "react";
import { requireAuth, can } from "@/lib/auth";
import { FinanceNav } from "./finance-nav";

// Finanzas, Facturación, Gastos y Contabilidad viven bajo un solo menú
// (Santiago, 2 oct 2026). Admins only reach Gastos and get no sub-navigation.
export default async function FinanceLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) return <>{children}</>;
  return (
    <div>
      <Suspense fallback={<div className="h-11 border-b" />}>
        <FinanceNav />
      </Suspense>
      {children}
    </div>
  );
}
