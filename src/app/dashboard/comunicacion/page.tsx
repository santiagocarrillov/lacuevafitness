import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getConversations, getAssignableStaff } from "@/lib/actions/comunicacion";
import { getAssignableUsers } from "@/lib/actions/staff-tasks";
import { Inbox } from "./inbox";

export const dynamic = "force-dynamic";

export default async function ComunicacionPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: openId } = await searchParams;
  const user = await requireAuth();
  if (!can.manageLeads(user)) redirect("/dashboard?forbidden=1");

  const [conversations, staff, taskUsers] = await Promise.all([
    getConversations("all"),
    getAssignableStaff(),
    getAssignableUsers(),
  ]);

  return (
    <div className="h-[calc(100vh-3rem)] md:h-screen flex flex-col">
      <header className="px-4 md:px-6 py-3 border-b border-border shrink-0 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Comunicación</h1>
          <p className="text-xs text-muted-foreground">
            Inbox compartido de WhatsApp — leads de ambas sedes. Toma el control cuando quieras; el agente sigue el resto.
          </p>
        </div>
        {user.role === "OWNER" && (
          <Link
            href="/dashboard/comunicacion/whatsapp-setup"
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Configurar número
          </Link>
        )}
      </header>
      <Inbox
        initialConversations={conversations}
        staff={staff}
        currentUserId={user.id}
        initialOpenId={openId ?? null}
        taskDialog={{
          users: taskUsers,
          currentUserId: user.id,
          canPool: true,
          defaultSede: user.sede,
        }}
      />
    </div>
  );
}
