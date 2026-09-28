"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchTaskPeople } from "@/lib/actions/staff-tasks";
import type { PersonSearchResult } from "@/lib/tasks/meta";

/** Type-ahead over socios (and leads, for the front desk). */
export function PersonPicker({
  onPick,
  autoFocus,
}: {
  onPick: (p: PersonSearchResult) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchTaskPeople(query);
        if (mine === seq.current) setResults(r);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre o teléfono del socio o lead"
          className="h-8 pl-7 text-sm"
          autoFocus={autoFocus}
        />
      </div>
      {q.trim().length >= 2 && (
        <ul className="max-h-56 overflow-y-auto rounded-md border border-border bg-background text-sm">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {loading ? "Buscando…" : "Nadie con ese nombre."}
            </li>
          ) : (
            results.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(r);
                    setQ("");
                    setResults([]);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-accent"
                >
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{r.detail}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
