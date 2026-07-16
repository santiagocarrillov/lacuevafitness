import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getConversations, getAssignableStaff } from "@/lib/actions/comunicacion";
import { Inbox } from "./inbox";

export const dynamic = "force-dynamic";

export default async function ComunicacionPage() {
  const user = await requireAuth();
  if (!can.manageLeads(user)) redirect("/dashboard?forbidden=1");

  const [conversations, staff] = await Promise.all([
    getConversations("all"),
    getAssignableStaff(),
  ]);

  return (
    <div className="h-[calc(100vh-3rem)] md:h-screen flex flex-col">
      <header className="px-4 md:px-6 py-3 border-b border-border shrink-0">
        <h1 className="text-lg font-semibold">Comunicación</h1>
        <p className="text-xs text-muted-foreground">
          Inbox compartido de WhatsApp — leads de ambas sedes. Toma el control cuando quieras; el agente sigue el resto.
        </p>
      </header>
      <Inbox
        initialConversations={conversations}
        staff={staff}
        currentUserId={user.id}
      />
    </div>
  );
}
