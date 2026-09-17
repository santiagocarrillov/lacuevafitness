import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import {
  getSubscribedApps,
  getWhatsappDiagnostics,
  listWabaPhoneNumbers,
} from "@/lib/actions/whatsapp-setup";
import { DEFAULT_WABA_ID, isNumericId } from "@/lib/whatsapp/setup-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GraphErrorBox } from "./graph-error";
import { RegisterNumberForm, SubscribeAppButton } from "./setup-actions";

export const dynamic = "force-dynamic";

function fmtUnix(ts: number | null): string {
  if (ts === null) return "—";
  if (ts === 0) return "Nunca expira";
  return new Date(ts * 1000).toLocaleString("es-EC", { timeZone: "America/Guayaquil" });
}

function statusVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "CONNECTED":
    case "VERIFIED":
    case "APPROVED":
    case "GREEN":
      return "default";
    case "PENDING":
    case "YELLOW":
      return "secondary";
    case "DISCONNECTED":
    case "FLAGGED":
    case "RESTRICTED":
    case "BANNED":
    case "DECLINED":
    case "RED":
      return "destructive";
    default:
      return "outline";
  }
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs">
        {value ? <Badge variant={statusVariant(value)}>{value}</Badge> : "—"}
      </dd>
    </div>
  );
}

export default async function WhatsappSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ waba?: string }>;
}) {
  const user = await requireAuth();
  if (user.role !== "OWNER") redirect("/dashboard?forbidden=1");

  const params = await searchParams;
  const requested = (params.waba ?? "").trim();
  const wabaId =
    requested && isNumericId(requested)
      ? requested
      : process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || DEFAULT_WABA_ID;

  const [diag, numbers, apps] = await Promise.all([
    getWhatsappDiagnostics(),
    listWabaPhoneNumbers(wabaId),
    getSubscribedApps(wabaId),
  ]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <header className="space-y-1">
        <Link href="/dashboard/comunicacion" className="text-xs text-muted-foreground hover:underline">
          ← Comunicación
        </Link>
        <h1 className="text-lg font-semibold">Configuración del número de WhatsApp</h1>
        <p className="text-xs text-muted-foreground">
          Solo OWNER. Todas las llamadas a Graph API ({diag.graphVersion}) se hacen en el servidor con
          WHATSAPP_TOKEN; el token nunca se muestra.
        </p>
      </header>

      {/* 1. Diagnóstico */}
      <Card>
        <CardHeader>
          <CardTitle>1. Diagnóstico</CardTitle>
          <CardDescription>Variables de entorno (solo si están definidas) y estado del token.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm">
            {diag.env.map((v) => (
              <li key={v.name} className="flex items-center justify-between gap-2 border-b border-border/50 py-1">
                <span className="font-mono text-xs">{v.name}</span>
                <Badge variant={v.set ? "default" : "outline"}>{v.set ? "definida" : "no definida"}</Badge>
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Token (debug_token)</h3>
            {!diag.token ? (
              <p className="text-sm text-muted-foreground">WHATSAPP_TOKEN no está definido.</p>
            ) : !diag.token.ok ? (
              <GraphErrorBox error={diag.token.error} title="debug_token falló" />
            ) : (
              <div className="space-y-3 text-sm">
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">is_valid</dt>
                    <dd>
                      <Badge variant={diag.token.data.is_valid ? "default" : "destructive"}>
                        {String(diag.token.data.is_valid)}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">type</dt>
                    <dd className="font-mono text-xs">{diag.token.data.type ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">app</dt>
                    <dd className="font-mono text-xs">
                      {diag.token.data.application ?? "—"} {diag.token.data.app_id ? `(${diag.token.data.app_id})` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">expires_at</dt>
                    <dd className="text-xs">{fmtUnix(diag.token.data.expires_at)}</dd>
                  </div>
                </dl>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">scopes</p>
                  <div className="flex flex-wrap gap-1">
                    {diag.token.data.scopes.length === 0 ? (
                      <span className="text-xs">—</span>
                    ) : (
                      diag.token.data.scopes.map((s) => (
                        <Badge key={s} variant="outline" className="font-mono">
                          {s}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">granular_scopes → target_ids</p>
                  <ul className="space-y-1 font-mono text-xs">
                    {diag.token.data.granular_scopes.length === 0 ? (
                      <li>—</li>
                    ) : (
                      diag.token.data.granular_scopes.map((g) => (
                        <li key={g.scope}>
                          <span className="font-semibold">{g.scope}</span>:{" "}
                          {g.target_ids.length ? (
                            g.target_ids.map((t) => (
                              <span key={t} className={t === wabaId ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""}>
                                {t}{" "}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted-foreground">(todos)</span>
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* WABA selector */}
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground block">WABA ID</span>
          <Input name="waba" defaultValue={wabaId} inputMode="numeric" className="w-56 font-mono" />
        </label>
        <Button type="submit" size="sm" variant="outline">
          Consultar
        </Button>
        <span className="text-xs text-muted-foreground">
          Por defecto: WHATSAPP_BUSINESS_ACCOUNT_ID {diag.envWabaId ? "" : `(no definida → ${DEFAULT_WABA_ID})`}
        </span>
      </form>

      {/* 2 + 3. Números */}
      <Card>
        <CardHeader>
          <CardTitle>2. Números del WABA</CardTitle>
          <CardDescription>
            GET /{wabaId}/phone_numbers. El número marcado como “en uso” es WHATSAPP_PHONE_ID
            {diag.envPhoneId ? ` (${diag.envPhoneId})` : " (no definida)"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!numbers.ok ? (
            <GraphErrorBox error={numbers.error} />
          ) : numbers.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este WABA no tiene números.</p>
          ) : (
            numbers.data.map((n) => (
              <div
                key={n.id}
                className={`rounded-lg border p-3 space-y-3 ${n.isEnvPhone ? "border-primary" : "border-border"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{n.display_phone_number ?? "(sin número)"}</span>
                  <span className="text-sm text-muted-foreground">{n.verified_name ?? ""}</span>
                  {n.isEnvPhone && <Badge>en uso (WHATSAPP_PHONE_ID)</Badge>}
                  <span className="ml-auto font-mono text-xs text-muted-foreground">id {n.id}</span>
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Field label="status" value={n.status} />
                  <Field label="code_verification_status" value={n.code_verification_status} />
                  <Field label="name_status" value={n.name_status} />
                  <Field label="platform_type" value={n.platform_type} />
                  <Field label="quality_rating" value={n.quality_rating} />
                  <Field label="throughput" value={n.throughput} />
                </dl>
                <div className="border-t border-border/60 pt-3">
                  <p className="text-sm font-medium mb-2">3. Registrar en Cloud API</p>
                  <RegisterNumberForm phoneId={n.id} display={n.display_phone_number ?? n.id} />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* 4. Webhooks */}
      <Card>
        <CardHeader>
          <CardTitle>4. Apps suscritas al webhook</CardTitle>
          <CardDescription>GET /{wabaId}/subscribed_apps</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!apps.ok ? (
            <GraphErrorBox error={apps.error} />
          ) : apps.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna app suscrita a este WABA.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {apps.data.map((a, i) => (
                <li key={a.id ?? i} className="flex flex-wrap gap-2">
                  <span className="font-medium">{a.name ?? "(sin nombre)"}</span>
                  <span className="font-mono text-xs text-muted-foreground">{a.id ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
          <SubscribeAppButton wabaId={wabaId} />
        </CardContent>
      </Card>
    </div>
  );
}
