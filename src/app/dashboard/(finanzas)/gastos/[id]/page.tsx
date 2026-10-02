import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { ecuadorDateString } from "@/lib/timezone";
import { getExpenseForEdit, getReceiptUrl } from "@/lib/actions/expenses";
import { PayExpenseForm } from "./pay-form";
import { ExpenseEditor } from "../expense-editor";
import { expenseScope } from "../shared";

export const dynamic = "force-dynamic";

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function EditarGastoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const scope = await expenseScope(user);
  if (!scope) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const e = await getExpenseForEdit(id);
  if (!e) notFound();
  const editable = !e.voidedAt && (scope.full || (e.createdById === user.id && !e.reviewedAt));
  const receiptUrl = e.receiptPath ? await getReceiptUrl(e.id) : null;

  // Expenses recorded before Módulo 3 have no lines: show one line from the header.
  const legacyCode =
    scope.accounts[e.sede].find((a) => a.category === e.category)?.code ?? scope.accounts[e.sede].find((a) => a.code === "5.3.99")?.code ?? "";
  const lines = e.lines.length
    ? e.lines.map((l) => ({ accountCode: l.account.code, description: l.description, subtotalCents: l.subtotalCents, ivaRate: l.ivaRate, ivaCents: l.ivaCents }))
    : [{ accountCode: legacyCode, description: e.description, subtotalCents: e.amountCents - (e.ivaCents ?? 0), ivaRate: e.ivaCents ? 15 : 0, ivaCents: e.ivaCents ?? 0 }];

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-6xl">
      <div>
        <Link href={`/dashboard/gastos?mes=${ymd(e.date)!.slice(0, 7)}`} className="text-sm text-muted-foreground hover:underline">← Gastos</Link>
        <h1 className="text-2xl font-semibold">{editable ? "Editar gasto" : "Gasto"}</h1>
        {e.voidedAt && <p className="text-sm text-destructive">Anulado: {e.voidReason}</p>}
        {!editable && !e.voidedAt && <p className="text-sm text-muted-foreground">Ya fue revisado: si hay que corregir algo, avísale a Isabel.</p>}
        {receiptUrl && (
          <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
            Ver comprobante adjunto ↗
          </a>
        )}
        {!e.lines.length && editable && (
          <p className="text-sm text-muted-foreground">Este gasto se registró sin líneas: al guardar se divide en las cuentas que elijas.</p>
        )}
      </div>
      {scope.full && !e.voidedAt && e.status === "PENDING" && <PayExpenseForm id={e.id} />}
      <fieldset disabled={!editable}>
        <ExpenseEditor
          sedes={[e.sede]}
          accounts={scope.accounts}
          isAdmin={!scope.full}
          today={ecuadorDateString()}
          initial={{
            id: e.id,
            sede: e.sede,
            supplierName: e.supplierName,
            supplierRuc: e.supplierRuc,
            documentType: e.documentType,
            documentNumber: e.documentNumber,
            sriAccessKey: e.sriAccessKey,
            date: ymd(e.date)!,
            paid: e.status === "PAID",
            paymentMethod: e.paymentMethod,
            paidAt: ymd(e.paidAt),
            dueDate: ymd(e.dueDate),
            notes: e.notes,
            receiptPath: e.receiptPath,
            lines,
          }}
        />
      </fieldset>
    </div>
  );
}
