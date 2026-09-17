import type { GraphError } from "@/lib/whatsapp/setup-shared";

/** Full Graph API error display (server or client). */
export function GraphErrorBox({ error, title }: { error: GraphError; title?: string }) {
  const rows: [string, string | number | undefined][] = [
    ["HTTP", error.httpStatus ?? undefined],
    ["type", error.type],
    ["code", error.code],
    ["error_subcode", error.error_subcode],
    ["error_data.details", error.error_data_details],
    ["error_user_title", error.error_user_title],
    ["error_user_msg", error.error_user_msg],
    ["fbtrace_id", error.fbtrace_id],
  ];
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm space-y-1">
      <p className="font-medium text-destructive">{title ?? "Error de Graph API"}</p>
      <p className="break-words">{error.message}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs font-mono">
        {rows
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words">{String(v)}</dd>
            </div>
          ))}
      </dl>
      {error.raw !== undefined && error.raw !== null && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Respuesta cruda de Graph</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono">
            {JSON.stringify(error.raw, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
