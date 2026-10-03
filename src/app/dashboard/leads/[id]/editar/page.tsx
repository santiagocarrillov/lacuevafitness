import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getLead, getStaffUsers } from "@/lib/actions/leads";
import { FormPage } from "@/app/dashboard/form-page";
import { ECUADOR_TZ } from "@/lib/timezone";
import { EditLeadForm } from "./edit-lead-form";

export const dynamic = "force-dynamic";

/** "YYYY-MM-DDTHH:mm" en hora de Ecuador, para <input type="datetime-local">. */
function localInput(d: Date | null) {
  if (!d) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: ECUADOR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

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
