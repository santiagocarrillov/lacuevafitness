import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import {
  getOutboundDiagnostics,
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
import { RegisterNumberForm, SubscribeAppButton, TestSendForm } from "./setup-actions";

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil" });
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

  const [diag, numbers, apps, outbound] = await Promise.all([
    getWhatsappDiagnostics(),
    listWabaPhoneNumbers(wabaId),
    getSubscribedApps(wabaId),
    getOutboundDiagnostics(),
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
                {!v.set ? (
                  <Badge variant="outline">no definida</Badge>
                ) : v.secret ? (
                  <Badge variant="default">definida (secreto oculto)</Badge>
                ) : (
                  <span className="font-mono text-xs break-all text-right">{v.value}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            De WHATSAPP_TOKEN, WHATSAPP_APP_SECRET y WHATSAPP_VERIFY_TOKEN solo se muestra si están
            definidas. El resto no son secretos y se muestra su valor: un valor equivocado ahí (por
            ejemplo WHATSAPP_AGENT_AUTOSEND distinto de <code>true</code>) explica que el agente
            genere respuestas que nunca salen.
          </p>

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
            GET /{wabaId}/phone_numbers. Se marca “en uso” el número cuyo id coincide con
            WHATSAPP_PHONE_ID, hoy configurado como{" "}
            {diag.envPhoneId ? (
              <code className="font-mono">{diag.envPhoneId}</code>
            ) : (
              <span className="font-medium">(no definida)</span>
            )}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {diag.envPhoneId && !diag.envPhoneIdLooksValid && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="font-medium text-destructive">WHATSAPP_PHONE_ID no es un id válido</p>
              <p className="text-xs mt-1">
                El valor configurado es <code className="font-mono">{diag.envPhoneId}</code>, que no es
                un id numérico de Graph. Todos los envíos van a
                https://graph.facebook.com/{diag.graphVersion}/{diag.envPhoneId}/messages y fallan.
                Debe ser el <span className="font-medium">Phone number ID</span> (columna “id” de abajo),
                no el número telefónico ni el nombre de la variable.
              </p>
            </div>
          )}
          {!diag.envPhoneId && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="font-medium text-destructive">WHATSAPP_PHONE_ID no está definida</p>
              <p className="text-xs mt-1">Sin esa variable no se puede enviar ningún mensaje.</p>
            </div>
          )}
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

      {/* 5. Mensajes salientes */}
      <Card>
        <CardHeader>
          <CardTitle>5. Últimos mensajes salientes</CardTitle>
          <CardDescription>
            Los 10 Message OUTBOUND más recientes (más nuevo primero). “ENVIADO” = la fila tiene
            externalId, es decir Cloud API devolvió un wamid. “BORRADOR/NO ENVIADO” = nunca se
            entregó a Meta: o el auto-envío está apagado, o el envío falló.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">WHATSAPP_AGENT_AUTOSEND:</span>
            <Badge variant={outbound.autoSend ? "default" : "destructive"}>
              {outbound.autoSend ? "true (el agente envía)" : "apagado (todo queda en borrador)"}
            </Badge>
          </div>

          {outbound.newest && (
            <div className="rounded-lg border border-border p-3 text-xs space-y-1">
              <p className="font-medium text-sm">Ventana de 24 h del mensaje más reciente</p>
              <p className="font-mono break-all">{outbound.newest.waPhone}</p>
              <p>
                Último inbound:{" "}
                {outbound.newest.lastInboundAt ? fmtDate(outbound.newest.lastInboundAt) : "—"}
                {outbound.newest.hoursSinceInbound !== null
                  ? ` (hace ${outbound.newest.hoursSinceInbound} h)`
                  : ""}
              </p>
              <Badge variant={outbound.newest.withinWindow ? "default" : "destructive"}>
                {outbound.newest.withinWindow
                  ? "dentro de la ventana de 24 h"
                  : "fuera de la ventana de 24 h — el texto libre se rechaza"}
              </Badge>
            </div>
          )}

          {!outbound.hasErrorField && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              El modelo <code className="font-mono">Message</code> no tiene ningún campo de error ni de
              estado, así que un envío fallido no deja rastro en la base: hoy solo se registra con
              <code className="font-mono"> console.error</code> en{" "}
              <code className="font-mono">agent-runner.ts</code> y la fila queda igual que un borrador.
              Para verlo en la app haría falta una migración (columna de error/estado).
            </p>
          )}

          {outbound.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay mensajes salientes.</p>
          ) : (
            <div className="space-y-2">
              {outbound.messages.map((m) => (
                <div key={m.id} className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={m.delivered ? "default" : "destructive"}>
                      {m.delivered ? "ENVIADO" : "BORRADOR/NO ENVIADO"}
                    </Badge>
                    {m.llmGenerated && <Badge variant="secondary">llmGenerated</Badge>}
                    <span className="font-mono text-xs break-all">{m.waPhone}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{fmtDate(m.createdAt)}</span>
                  </div>
                  <p className="text-xs whitespace-pre-wrap break-words">{m.body}</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs font-mono">
                    <dt className="text-muted-foreground">externalId</dt>
                    <dd className="break-all">{m.externalId ?? "—"}</dd>
                    <dt className="text-muted-foreground">sentByUserId</dt>
                    <dd className="break-all">{m.sentByUserId ?? "— (bot)"}</dd>
                    <dt className="text-muted-foreground">error / status</dt>
                    <dd>sin columna en el modelo Message</dd>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 6. Envío de prueba */}
      <Card>
        <CardHeader>
          <CardTitle>6. Enviar mensaje de prueba</CardTitle>
          <CardDescription>
            POST /{diag.envPhoneId ?? "WHATSAPP_PHONE_ID"}/messages con un texto plano. Muestra la
            respuesta cruda de Graph o el error completo (code, error_subcode, error_data.details,
            error_user_msg, fbtrace_id).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TestSendForm phoneId={diag.envPhoneId} />
        </CardContent>
      </Card>
    </div>
  );
}
