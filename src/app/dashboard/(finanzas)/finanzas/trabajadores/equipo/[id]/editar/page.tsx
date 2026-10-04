import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ecuadorDateString } from "@/lib/timezone";
import { FormPage } from "@/app/dashboard/form-page";
import { EmployeeForm } from "../../employee-form";

export const dynamic = "force-dynamic";

export default async function EditarTrabajadorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const e = await prisma.employee.findUnique({ where: { id } });
  if (!e) notFound();
  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
  return (
    <FormPage title={`Editar ${e.firstName} ${e.lastName}`} description="Los roles ya aprobados no cambian; el próximo rol usa estos datos." wide>
      <EmployeeForm
        today={ecuadorDateString()}
        initial={{
          id: e.id, sede: e.sede, firstName: e.firstName, lastName: e.lastName, idNumber: e.idNumber ?? "", email: e.email ?? "", phone: e.phone ?? "",
          position: e.position ?? "", employmentType: e.employmentType, monthlySalaryCents: e.monthlySalaryCents, weeklyHours: e.weeklyHours,
          startDate: d(e.startDate)!, endDate: d(e.endDate), iessAffiliated: e.iessAffiliated, monthlyDecimoTercero: e.monthlyDecimoTercero,
          monthlyDecimoCuarto: e.monthlyDecimoCuarto, monthlyFondosReserva: e.monthlyFondosReserva, bankName: e.bankName ?? "",
          bankAccount: e.bankAccount ?? "", notes: e.notes ?? "",
        }}
      />
    </FormPage>
  );
}
