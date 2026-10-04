"use client";

import { textMatches } from "@/lib/text";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { setMemberPayer } from "@/lib/actions/payers";

type PayerOpt = { id: string; name: string; taxId: string; members: string[] };

/** Pick an existing payer for a member (search by name or ID). */
export function PayerPicker({ memberId, memberName, payers, after }: { memberId: string; memberName: string; payers: PayerOpt[]; after: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const shown = useMemo(() => {
    return payers.filter((p) => textMatches(`${p.name} ${p.taxId} ${p.members.join(" ")}`, q)).slice(0, 8);
  }, [q, payers]);
  if (payers.length === 0) return null;
  return (
    <div className="space-y-2">
      <Input placeholder="Buscar pagador por nombre, cédula o socio…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="divide-y rounded-md border">
        {shown.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {p.taxId}
                {p.members.length > 0 && ` · paga por ${p.members.join(", ")}`}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    await setMemberPayer(memberId, p.id);
                    toast.success(`${p.name} paga por ${memberName}`);
                    router.push(after);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "No se pudo asignar.");
                  }
                })
              }
              className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              Asignar
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Ninguno coincide.</li>}
      </ul>
    </div>
  );
}

/** "Quitar": the member pays for themselves again. */
export function RemovePayerButton({ memberId, label = "quitar" }: { memberId: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await setMemberPayer(memberId, null);
            toast.success("Pagador quitado");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo quitar.");
          }
        })
      }
      className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
    >
      {label}
    </button>
  );
}
