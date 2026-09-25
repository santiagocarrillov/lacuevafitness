"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Debounced async search. Results are derived from the term they belong to, so
 * nothing is set synchronously inside the effect (react-hooks/set-state-in-effect)
 * and stale responses never overwrite newer ones.
 */
export function useDebouncedSearch<T>(
  q: string,
  search: (term: string) => Promise<T[]>,
  { minLength = 2, delay = 250 }: { minLength?: number; delay?: number } = {},
) {
  const term = q.trim();
  const active = term.length >= minLength;
  const [state, setState] = useState<{ term: string; results: T[] }>({ term: "", results: [] });
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const results = await searchRef.current(term);
        if (!cancelled) setState({ term, results });
      } catch {
        if (!cancelled) setState({ term, results: [] });
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term, active, delay]);

  return {
    // Keep showing the previous results while the next ones load (less flicker).
    results: active ? state.results : [],
    loading: active && state.term !== term,
    done: active && state.term === term,
  };
}
