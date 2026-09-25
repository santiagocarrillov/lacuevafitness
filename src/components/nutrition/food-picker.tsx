"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useDebouncedSearch } from "./use-debounced-search";
import { searchFoods, type FoodRow } from "@/lib/actions/foods";

/**
 * Debounced search over the food database (staff). Calls `onPick` with the
 * chosen food; the parent decides the quantity. Used by the recipe editor and
 * the meal-plan editor.
 */
export function FoodPicker({
  onPick,
  placeholder = "Buscar alimento…",
  autoFocus,
}: {
  onPick: (food: FoodRow) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { results, loading } = useDebouncedSearch(q, (term) => searchFoods(term, 12));
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <Input
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (results.length > 0 || (!loading && q.trim().length >= 2)) && (
        <ul className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-input bg-popover shadow-md divide-y">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados.</li>}
          {results.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick(f);
                  setQ("");
                  setOpen(false);
                }}
              >
                <span className="font-medium">{f.name}</span>
                {f.brand && <span className="text-muted-foreground"> · {f.brand}</span>}
                {!f.verified && <span className="ml-1 text-[10px] text-amber-700">(sin verificar)</span>}
                <span className="block text-xs text-muted-foreground">
                  {Math.round(f.kcal)} kcal · P {f.proteinG} · C {f.carbsG} · G {f.fatG} por 100 {f.isLiquid ? "ml" : "g"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
