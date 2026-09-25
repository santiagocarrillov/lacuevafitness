"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard/nutricion", label: "Agenda", clinical: false },
  { href: "/dashboard/nutricion/cobertura", label: "Cobertura", clinical: false },
  { href: "/dashboard/nutricion/socios", label: "Socios", clinical: true },
  { href: "/dashboard/nutricion/planes", label: "Planes", clinical: true },
  { href: "/dashboard/nutricion/alimentos", label: "Alimentos", clinical: true },
  { href: "/dashboard/nutricion/recetas", label: "Recetas", clinical: true },
  { href: "/dashboard/nutricion/calculadora", label: "Calculadora", clinical: true },
  { href: "/dashboard/nutricion/tips", label: "Tips", clinical: false },
];

/** `clinical` tabs (food DB, recipes, calculator) are for the nutritionist and OWNER only. */
export function NutricionTabs({ showClinical }: { showClinical: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-border overflow-x-auto">
      {TABS.filter((t) => showClinical || !t.clinical).map((t) => {
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
