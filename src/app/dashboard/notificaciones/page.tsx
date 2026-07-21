import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getPushAudience, pushConfigured } from "@/lib/actions/push";
import { BroadcastForm } from "./broadcast-form";

export const dynamic = "force-dynamic";

export default async function NotificacionesPage() {
  const user = await requireAuth();
  if (!can.manageMembers(user)) redirect("/dashboard");

  const [audience, configured] = await Promise.all([getPushAudience(), pushConfigured()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notificaciones push</h1>
        <p className="text-sm text-muted-foreground">
          Envía un aviso a los socios que instalaron la app y activaron notificaciones.
        </p>
      </div>

      {!configured && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ Push aún no está configurado en el servidor (faltan las claves VAPID en Vercel). Los
          envíos fallarán hasta agregarlas.
        </div>
      )}

      <div className="rounded-md border p-3 text-sm text-muted-foreground">
        Audiencia suscrita: <strong className="text-foreground">{audience.total}</strong> socios ·
        Fitness Center {audience.fitness} · Xtreme {audience.xtreme}
      </div>

      <BroadcastForm audience={audience} />
    </div>
  );
}
