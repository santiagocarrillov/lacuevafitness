import { ReactNode, Suspense } from "react";
import { requireAuth, can } from "@/lib/auth";
import { FinanceNav } from "../(finanzas)/finance-nav";

// Pagos is Clientes › Cobros de socios in the accounting app: same white page
// and module bar. Front-desk admins get the white page without the bar.
export default async function PagosLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();
  return (
    <div className="min-h-[calc(100vh-2.75rem)] bg-white">
      {can.viewFinancials(user) && (
        <Suspense fallback={<div className="h-[5.5rem] border-b" />}>
          <FinanceNav />
        </Suspense>
      )}
      {children}
    </div>
  );
}
