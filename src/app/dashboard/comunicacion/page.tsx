import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getConversations, getAssignableStaff } from "@/lib/actions/comunicacion";
import { Inbox } from "./inbox";

export const dynamic = "force-dynamic";

export default async function ComunicacionPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; vista?: string }>;
}) {
  const { c: openId, vista } = await searchParams;
  const user = await requireAuth();
  if (!can.manageLeads(user)) redirect("/dashboard?forbidden=1");

  const [conversations, staff] = await Promise.all([
    getConversations("all"),
    getAssignableStaff(),
  ]);

  return (
    <div className="h-[calc(100dvh-3rem)] md:h-[calc(100dvh-2.75rem)] flex flex-col bg-card">
      <header className="px-4 md:px-6 py-3 border-b border-border shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">WhatsApp</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Inbox compartido de ambas sedes · el agente IA responde y tú tomas el control cuando quieras.
          </p>
        </div>
        {user.role === "OWNER" && (
          <div className="flex shrink-0 items-center gap-4 text-xs font-medium">
            <Link href="/dashboard/comunicacion/avisos" className="text-primary hover:underline">
              Avisos
            </Link>
            <Link href="/dashboard/comunicacion/plantillas" className="text-primary hover:underline">
              Plantillas
            </Link>
            <Link href="/dashboard/comunicacion/whatsapp-setup" className="text-primary hover:underline">
              Configurar número
            </Link>
          </div>
        )}
      </header>
      <Inbox
        initialConversations={conversations}
        staff={staff}
        currentUserId={user.id}
        initialOpenId={openId ?? null}
        initialView={vista === "tablero" ? "tablero" : "lista"}
      />
    </div>
  );
}
