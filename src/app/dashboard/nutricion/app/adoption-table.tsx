"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { emailPortalInvite, generatePortalInvite, updateMember } from "@/lib/actions/members";
import type { AdoptionRow, AdoptionState } from "@/lib/actions/portal-adoption";
import { publicBaseUrl } from "@/lib/site-url";

type Sede = "FITNESS_CENTER" | "XTREME";

const STATE_META: Record<AdoptionState, { label: string; cls: string }> = {
  notInvited: { label: "Sin invitar", cls: "bg-amber-100 text-amber-800" },
  noEmail: { label: "Sin correo", cls: "bg-red-100 text-red-800" },
  expired: { label: "Código vencido", cls: "bg-orange-100 text-orange-800" },
  invited: { label: "Código enviado", cls: "bg-sky-100 text-sky-800" },
  app: { label: "Usa la app", cls: "bg-emerald-100 text-emerald-800" },
};

const FILTERS: { key: AdoptionState | "pendientes"; label: string }[] = [
  { key: "pendientes", label: "Pendientes" },
  { key: "notInvited", label: "Sin invitar" },
  { key: "noEmail", label: "Sin correo" },
  { key: "expired", label: "Código vencido" },
  { key: "invited", label: "Código enviado" },
  { key: "app", label: "Usan la app" },
];

/** Ecuadorian mobile (09xxxxxxxx / +593…) → wa.me number, or null. */
function waNumber(phone: string | null): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (/^09\d{8}$/.test(d)) return `593${d.slice(1)}`;
  if (/^5939\d{8}$/.test(d)) return d;
  return null;
}

function inviteText(name: string, email: string, code: string) {
  return `¡Hola ${name.split(" ")[0]}! 👋 Ya puedes usar la app de La Cueva: tu plan de nutrición, tu rutina y tu progreso en el celular.\n\n1. Entra a ${publicBaseUrl()}/portal/signup\n2. Correo: ${email}\n3. Código: ${code}\n\nCreas tu contraseña y listo. El código vale 14 días.`;
}

function Row({ r }: { r: AdoptionRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState(r.code);
  const [editingEmail, setEditingEmail] = useState(r.state === "noEmail");
  const [email, setEmail] = useState(r.email ?? "");
  const hasEmail = Boolean(r.email);

  function generate() {
    startTransition(async () => {
      const res = await generatePortalInvite(r.memberId);
      if (!res.ok) return void toast.error(res.error);
      setCode(res.code);
      toast.success("Código generado. Cópialo o mándalo por WhatsApp.");
      router.refresh();
    });
  }

  function saveEmail() {
    startTransition(async () => {
      const res = await updateMember(r.memberId, { email });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Correo guardado.");
      setEditingEmail(false);
      router.refresh();
    });
  }

  function sendEmail() {
    startTransition(async () => {
      const res = await emailPortalInvite(r.memberId);
      if (!res.ok) return void toast.error(res.error ?? "No se pudo enviar.");
      toast.success(`Invitación enviada a ${r.email}.`);
    });
  }

  const text = code && r.email ? inviteText(r.name, r.email, code) : "";
  const wa = waNumber(r.phone);

  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        <Link href={`/dashboard/socios/${r.memberId}`} className="font-medium hover:underline">
          {r.name}
        </Link>
        <span className="block text-xs text-muted-foreground">
          {r.sede === "XTREME" ? "Xtreme" : "Fitness Center"}
          {r.phone ? ` · ${r.phone}` : ""}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className={`rounded px-2 py-0.5 text-xs ${STATE_META[r.state].cls}`}>{STATE_META[r.state].label}</span>
      </td>
      <td className="px-3 py-2 min-w-56">
        {editingEmail ? (
          <div className="flex gap-1">
            <Input className="h-8" type="email" placeholder="correo@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button size="sm" disabled={pending || !email.includes("@")} onClick={saveEmail}>
              Guardar
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="truncate">{r.email ?? "—"}</span>
            <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setEditingEmail(true)}>
              cambiar
            </button>
          </div>
        )}
        {code && (
          <p className="mt-1 font-mono text-sm">
            {code}
            {r.codeExpiresAt && code === r.code && (
              <span className="ml-2 font-sans text-xs text-muted-foreground">
                vence {new Date(r.codeExpiresAt).toLocaleDateString("es-EC", { day: "numeric", month: "short" })}
              </span>
            )}
          </p>
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-right">
        {r.state !== "app" && hasEmail && !code && (
          <Button size="sm" disabled={pending} onClick={generate}>
            {r.state === "expired" ? "Nuevo código" : "Generar código"}
          </Button>
        )}
        {code && (
          <div className="flex flex-wrap justify-end gap-1">
            {wa && (
              <a
                href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
              >
                WhatsApp
              </a>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(text).then(
                  () => toast.success("Mensaje copiado."),
                  () => toast.error("No se pudo copiar."),
                );
              }}
            >
              Copiar mensaje
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={sendEmail}>
              Por correo
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

export function AdoptionTable({ rows, sede, sedeLocked }: { rows: AdoptionRow[]; sede: Sede | null; sedeLocked: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<AdoptionState | "pendientes">("pendientes");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<AdoptionState, number> = { app: 0, invited: 0, expired: 0, noEmail: 0, notInvited: 0 };
    for (const r of rows) c[r.state]++;
    return c;
  }, [rows]);
  const pct = rows.length ? Math.round((counts.app / rows.length) * 100) : 0;

  const visible = rows.filter(
    (r) =>
      (filter === "pendientes" ? r.state !== "app" : r.state === filter) &&
      (!q.trim() || `${r.name} ${r.email ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Socios activos que usan la app</p>
            <p className="text-2xl font-semibold tabular-nums">
              {counts.app}/{rows.length} · {pct}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Sin invitar</p>
            <p className="text-2xl font-semibold tabular-nums">{counts.notInvited}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Sin correo</p>
            <p className="text-2xl font-semibold tabular-nums">{counts.noEmail}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Invitados que aún no entran</p>
            <p className="text-2xl font-semibold tabular-nums">{counts.invited + counts.expired}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === f.key ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"
            }`}
          >
            {f.label}
            <span className="ml-1 opacity-70">
              {f.key === "pendientes" ? rows.length - counts.app : counts[f.key]}
            </span>
          </button>
        ))}
        <Input className="h-8 w-48 ml-auto" placeholder="Buscar socio…" value={q} onChange={(e) => setQ(e.target.value)} />
        {!sedeLocked && (
          <select
            value={sede ?? ""}
            onChange={(e) => router.push(`/dashboard/nutricion/app${e.target.value ? `?sede=${e.target.value}` : ""}`)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Ambas sedes</option>
            <option value="FITNESS_CENTER">Fitness Center</option>
            <option value="XTREME">Xtreme</option>
          </select>
        )}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nadie en esta lista.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="px-3 py-2 font-medium">Socio</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Correo / código</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((r) => (
                  <Row key={r.memberId} r={r} />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        El socio entra a /portal/signup con su correo y el código (vale 14 días, un solo uso). Si ya activó la app y no puede
        entrar, abre su ficha → &quot;Invitar a la app&quot; para mandarle un link de recuperación o una contraseña temporal.
      </p>
    </div>
  );
}
