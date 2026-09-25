"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { searchMembersForCalc } from "@/lib/actions/nutrition-targets";
import { useDebouncedSearch } from "./use-debounced-search";

export type PickedMember = { id: string; firstName: string; lastName: string };

/** Socio search for nutrition staff. `multiple` keeps a chip list; otherwise picks one. */
export function MemberMultiSearch({
  value,
  onChange,
  multiple = true,
  autoFocus,
}: {
  value: PickedMember[];
  onChange: (v: PickedMember[]) => void;
  multiple?: boolean;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const { results } = useDebouncedSearch(q, searchMembersForCalc);

  const picked = new Set(value.map((m) => m.id));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              {m.firstName} {m.lastName}
              <button type="button" onClick={() => onChange(value.filter((x) => x.id !== m.id))} aria-label="Quitar">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      {(multiple || value.length === 0) && (
        <div className="relative">
          <Input autoFocus={autoFocus} placeholder="Buscar socio…" value={q} onChange={(e) => setQ(e.target.value)} />
          {results.length > 0 && (
            <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-input bg-popover shadow-md divide-y">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={picked.has(m.id)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-40"
                    onClick={() => {
                      onChange(multiple ? [...value, m] : [m]);
                      setQ("");
                    }}
                  >
                    {m.firstName} {m.lastName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
