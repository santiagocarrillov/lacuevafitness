"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// In-app navigation depth (module state survives client navigations). When
// the page was opened directly (no in-app history) Back goes to the parent.
let depth = 0;
let last = "";

export function useTrackNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== last) {
      depth++;
      last = pathname;
    }
  }, [pathname]);
}

/** Parent route: /dashboard/gastos/abc → /dashboard/gastos. */
export function parentOf(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return "/dashboard";
  return `/${parts.slice(0, -1).join("/")}`;
}

export function BackButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  if (pathname === "/dashboard") return null;
  return (
    <button
      type="button"
      onClick={() => (depth > 1 ? router.back() : router.push(parentOf(pathname)))}
      aria-label="Regresar"
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Atrás
    </button>
  );
}
