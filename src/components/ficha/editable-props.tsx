"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { updateMember } from "@/lib/actions/members";
import { updateLead } from "@/lib/actions/leads";

export type EditKind = "text" | "email" | "tel" | "date" | "datetime" | "select" | "textarea";

export type EditableProp = {
  field: string;
  label: string;
  /** Lo que se edita: texto, "YYYY-MM-DD", "YYYY-MM-DDTHH:mm" (hora Ecuador) o el valor de la opción. */
  value: string;
  /** Lo que se muestra; por defecto el valor (o la etiqueta de la opción). */
  display?: string;
  kind?: EditKind;
  options?: { value: string; label: string }[];
  href?: string;
  external?: boolean;
  readOnly?: boolean;
  placeholder?: string;
};

type Target = { kind: "member" | "lead"; id: string };

/**
 * Propiedades editables en el sitio, al estilo HubSpot: click en el valor (o
 * el lápiz), cambiar, Enter o ✓ guarda, Esc cancela. Cada campo se guarda solo;
 * un campo vaciado se borra. Lo que no se puede editar se ve igual, sin lápiz.
 */
export function EditablePropList({ target, props }: { target: Target; props: EditableProp[] }) {
  return (
    <dl className="space-y-3">
      {props.map((p) => (
        <PropRow key={p.field} target={target} prop={p} />
      ))}
    </dl>
  );
}

async function save(target: Target, field: string, value: string): Promise<string | null> {
  if (target.kind === "member") {
    // Names can't be null (the action refuses an empty first name); everything else clears to null.
    const v = value === "" && field !== "firstName" && field !== "lastName" ? null : value;
    const res = await updateMember(target.id, { [field]: v });
    return res.ok ? null : res.error;
  }
  let v: unknown = value;
  if (field === "trialScheduledAt") v = value ? `${value}:00-05:00` : "";
  else if (field === "trialAttended") v = value === "" ? null : value === "yes";
  else if (field === "ownerUserId") v = value || null;
  try {
    await updateLead(target.id, { [field]: v });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "No se pudo guardar.";
  }
}

function PropRow({ target, prop }: { target: Target; prop: EditableProp }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(prop.value);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null);
  const kind = prop.kind ?? "text";

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  const shown =
    prop.display ?? (kind === "select" ? prop.options?.find((o) => o.value === prop.value)?.label ?? prop.value : prop.value);

  function begin() {
    if (prop.readOnly) return;
    setDraft(prop.value);
    setEditing(true);
  }

  function commit(next = draft) {
    if (next === prop.value) {
      setEditing(false);
      return;
    }
    start(async () => {
      const error = await save(target, prop.field, next.trim());
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`${prop.label} actualizado.`);
      setEditing(false);
      router.refresh();
    });
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    } else if (e.key === "Enter" && (kind !== "textarea" || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  }

  const inputCls =
    "w-full rounded-md border border-primary bg-background px-2 py-1 text-sm outline-none ring-2 ring-primary/15 disabled:opacity-60";

  return (
    <div className="group/prop">
      <dt className="text-xs text-muted-foreground">{prop.label}</dt>
      {editing ? (
        <dd className="mt-1">
          {kind === "select" ? (
            <select
              ref={input}
              value={draft}
              disabled={pending}
              onChange={(e) => {
                setDraft(e.target.value);
                commit(e.target.value);
              }}
              onKeyDown={onKey}
              onBlur={() => !pending && setEditing(false)}
              className={inputCls}
            >
              {prop.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : kind === "textarea" ? (
            <textarea
              ref={input}
              value={draft}
              disabled={pending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              rows={3}
              placeholder={prop.placeholder}
              className={inputCls}
            />
          ) : (
            <input
              ref={input}
              type={kind === "datetime" ? "datetime-local" : kind}
              value={draft}
              disabled={pending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              placeholder={prop.placeholder}
              className={inputCls}
            />
          )}
          {kind !== "select" && (
            <div className="mt-1 flex justify-end gap-1">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={pending}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Cancelar"
                title="Cancelar (Esc)"
              >
                <X className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => commit()}
                disabled={pending}
                className="rounded bg-primary p-1 text-primary-foreground hover:bg-primary/90"
                aria-label="Guardar"
                title={kind === "textarea" ? "Guardar (⌘+Enter)" : "Guardar (Enter)"}
              >
                <Check className="size-3.5" />
              </button>
            </div>
          )}
        </dd>
      ) : (
        <dd className="mt-0.5 flex items-start gap-1 text-sm">
          <span
            className={`min-w-0 flex-1 break-words ${prop.readOnly ? "" : "-mx-1 cursor-text rounded px-1 hover:bg-muted"}`}
            onClick={prop.href ? undefined : begin}
          >
            {!shown ? (
              <span className="text-muted-foreground">--</span>
            ) : prop.href ? (
              prop.external ? (
                <a href={prop.href} target={prop.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="font-medium text-primary hover:underline">
                  {shown}
                </a>
              ) : (
                <Link href={prop.href} className="font-medium text-primary hover:underline">
                  {shown}
                </Link>
              )
            ) : (
              <span className="whitespace-pre-line">{shown}</span>
            )}
          </span>
          {!prop.readOnly && (
            <button
              type="button"
              onClick={begin}
              className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus:opacity-100 group-hover/prop:opacity-100 max-lg:opacity-60"
              aria-label={`Editar ${prop.label}`}
              title={`Editar ${prop.label}`}
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </dd>
      )}
    </div>
  );
}
