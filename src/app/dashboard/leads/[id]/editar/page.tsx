import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getLead, getStaffUsers } from "@/lib/actions/leads";
import { FormPage } from "@/app/dashboard/form-page";
import { ecuadorDateTimeInput as localInput } from "@/lib/timezone";
import { EditLeadForm } from "./edit-lead-form";

export const dynamic = "force-dynamic";

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  if (!can.manageLeads(user)) redirect("/dashboard?forbidden=1");
  const [lead, staff] = await Promise.all([getLead(id), getStaffUsers()]);
  if (!lead) return notFound();
  if (lead.member) redirect(`/dashboard/socios/${lead.member.id}/editar`);

  return (
    <FormPage title="Editar lead" description={`${lead.firstName} ${lead.lastName ?? ""}`.trim()}>
      <EditLeadForm
        lead={{
          id: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName ?? "",
          email: lead.email ?? "",
          phone: lead.phone ?? "",
          source: lead.source,
          notes: lead.notes ?? "",
          trialScheduledAt: localInput(lead.trialScheduledAt),
          trialAttended: lead.trialAttended,
          lostReason: lead.lostReason ?? "",
          ownerUserId: lead.ownerUserId ?? "",
        }}
        staff={staff.map((s) => ({ id: s.id, name: s.fullName }))}
      />
    </FormPage>
  );
}
