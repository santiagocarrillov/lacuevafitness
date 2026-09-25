"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard/nutricion", label: "Agenda" },
  { href: "/dashboard/nutricion/cobertura", label: "Cobertura" },
  { href: "/dashboard/nutricion/tips", label: "Tips" },
];

export function NutricionTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-border overflow-x-auto">
      {TABS.map((t) => {
        const active =
          t.href === "/dashboard/nutricion" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
