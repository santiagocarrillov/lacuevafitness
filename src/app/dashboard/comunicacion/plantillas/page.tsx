import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { listMetaTemplates } from "@/lib/actions/whatsapp-templates";
import { TEMPLATE_CATALOG } from "@/lib/whatsapp/template-catalog";
import { SubmitTemplateButton } from "./submit-button";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: "Aprobada", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  PENDING: { label: "En revisión", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  IN_APPEAL: { label: "En apelación", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  REJECTED: { label: "Rechazada", cls: "bg-red-50 text-red-800 ring-red-200" },
  PAUSED: { label: "Pausada", cls: "bg-stone-100 text-stone-700 ring-stone-200" },
  DISABLED: { label: "Desactivada", cls: "bg-stone-100 text-stone-700 ring-stone-200" },
};

function Chip({ status }: { status: string | null }) {
  const s = status ? STATUS[status] ?? { label: status, cls: "bg-stone-100 text-stone-700 ring-stone-200" } : { label: "Sin enviar", cls: "bg-white text-muted-foreground ring-stone-300" };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}>{s.label}</span>;
}

const fill = (body: string, vals: string[]) => vals.reduce((t, v, i) => t.replaceAll(`{{${i + 1}}}`, v), body);

export default async function PlantillasPage() {
  const user = await requireAuth();
  if (user.role !== "OWNER") redirect("/dashboard/comunicacion");
  const { templates, error } = await listMetaTemplates();
  const byName = new Map(templates.filter((t) => t.language.startsWith("es")).map((t) => [t.name, t]));
  const ours = new Set(TEMPLATE_CATALOG.map((t) => t.name));
  const others = templates.filter((t) => !ours.has(t.name));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <Link href="/dashboard/comunicacion" className="text-xs text-muted-foreground hover:underline">← WhatsApp</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Plantillas de WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Mensajes que la app puede mandar fuera de la ventana de 24 horas. Meta revisa cada una (minutos a 2 días); una vez aprobada, el texto ya no se puede cambiar.
        </p>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">No pude leer las plantillas de Meta: {error}</div>}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-600">Socios y nutrición</h2>
        <ul className="space-y-3">
          {TEMPLATE_CATALOG.map((t) => {
            const meta = byName.get(t.name);
            return (
              <li key={t.name} className="rounded-xl border border-stone-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">
                      <code>{t.name}</code> · {t.category === "UTILITY" ? "Servicio" : "Marketing"} · {t.when}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip status={meta?.status ?? null} />
                    {!meta && !error && <SubmitTemplateButton name={t.name} />}
                  </div>
                </div>
                <div className="mt-3 max-w-xl rounded-lg bg-[#e7f6e7] px-3 py-2 text-sm leading-relaxed text-stone-800">
                  {fill(t.body, t.example)}
                  {t.button && <div className="mt-2 border-t border-emerald-200 pt-1.5 text-center text-[13px] font-medium text-sky-700">↗ {t.button.text}</div>}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">Variables: {t.variables.map((v, i) => `{{${i + 1}}} ${v}`).join(" · ")}</p>
                {meta?.rejectedReason && <p className="mt-1 text-xs text-red-700">Motivo del rechazo: {meta.rejectedReason}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      {others.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-600">Otras plantillas de la cuenta</h2>
          <ul className="divide-y rounded-xl border border-stone-200 bg-white text-sm">
            {others.map((t) => (
              <li key={`${t.name}-${t.language}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span>
                  <code>{t.name}</code> <span className="text-xs text-muted-foreground">· {t.language} · {t.category}</span>
                </span>
                <Chip status={t.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
