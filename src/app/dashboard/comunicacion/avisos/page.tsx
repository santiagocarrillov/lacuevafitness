import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getNoticesOverview } from "@/lib/actions/member-notices";
import { LiveSwitch, RunNowButton } from "./controls";

export const dynamic = "force-dynamic";

const META: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: "Aprobada por Meta", cls: "bg-emerald-50 text-emerald-800" },
  PENDING: { label: "Meta la está revisando", cls: "bg-amber-50 text-amber-800" },
  REJECTED: { label: "Rechazada por Meta", cls: "bg-red-50 text-red-800" },
};
const when = (d: Date) => d.toLocaleString("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Guayaquil" });

export default async function AvisosPage() {
  const user = await requireAuth();
  if (user.role !== "OWNER") redirect("/dashboard/comunicacion");
  const { kinds, metaError, recent } = await getNoticesOverview();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <Link href="/dashboard/comunicacion" className="text-xs text-muted-foreground hover:underline">← WhatsApp</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Avisos automáticos a socios</h1>
        <p className="text-sm text-muted-foreground">
          Salen cada día a las 10:00 por WhatsApp. Apagado = modo prueba: solo ves a quién le escribiría. Para enviar de verdad tiene que estar
          prendido <b>y</b> aprobado por Meta (<Link href="/dashboard/comunicacion/plantillas" className="text-primary hover:underline">Plantillas</Link>). Cada aviso sale una sola vez por persona y motivo.
        </p>
      </header>
      {metaError && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No pude leer el estado de Meta: {metaError}</p>}

      <ul className="space-y-4">
        {kinds.map((k) => {
          const meta = k.metaStatus ? META[k.metaStatus] ?? { label: k.metaStatus, cls: "bg-stone-100 text-stone-700" } : { label: "Sin enviar a Meta", cls: "bg-stone-100 text-stone-600" };
          return (
            <li key={k.kind} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-2xl">
                  <p className="font-medium">{k.label}</p>
                  <p className="text-xs text-muted-foreground">{k.rule}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>{meta.label}</span>
                </div>
                {k.automatic ? (
                  <div className="flex items-center gap-3">
                    {k.live && k.metaStatus === "APPROVED" && k.today.length > 0 && <RunNowButton kind={k.kind} count={k.today.length} />}
                    <LiveSwitch kind={k.kind} live={k.live} />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Manual</span>
                )}
              </div>
              {k.automatic && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm">
                    Hoy: <b>{k.today.length}</b> {k.today.length === 1 ? "persona" : "personas"} {k.live && k.metaStatus === "APPROVED" ? "(se envía a las 10:00)" : "(modo prueba: no se envía)"}
                  </summary>
                  {k.today.length > 0 && (
                    <ul className="mt-2 max-h-72 divide-y overflow-auto rounded-lg border text-sm">
                      {k.today.map((c) => (
                        <li key={c.key} className="px-3 py-2">
                          <Link href={`/dashboard/socios/${c.memberId}`} className="font-medium hover:underline">{c.name}</Link>
                          {!c.phone && <span className="ml-2 text-xs text-amber-700">sin celular</span>}
                          <p className="text-xs text-muted-foreground">{c.preview}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              )}
            </li>
          );
        })}
      </ul>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-600">Últimos enviados</h2>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">Todavía no se ha enviado ningún aviso.</p>
        ) : (
          <ul className="divide-y rounded-xl border border-stone-200 bg-white text-sm">
            {recent.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-x-3 px-4 py-2">
                <span className="text-xs tabular-nums text-muted-foreground">{when(n.createdAt)}</span>
                <span className="font-medium">{n.member.firstName} {n.member.lastName}</span>
                <span className="text-xs text-muted-foreground">{kinds.find((k) => k.kind === n.kind)?.label ?? n.kind}</span>
                <span className={`ml-auto text-xs ${n.status === "SENT" ? "text-emerald-700" : "text-red-700"}`}>{n.status === "SENT" ? "Enviado" : `Falló: ${n.error ?? ""}`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
