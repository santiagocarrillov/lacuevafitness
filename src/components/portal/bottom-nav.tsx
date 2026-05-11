"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  {
    href: "/portal/hoy",
    label: "Hoy",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M3 12L12 3l9 9M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    href: "/portal/progreso",
    label: "Progreso",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </svg>
    ),
  },
  {
    href: "/portal/retos",
    label: "Retos",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M12 2l3 7h7l-6 4 2 8-6-5-6 5 2-8-6-4h7z" />
      </svg>
    ),
  },
  {
    href: "/portal/cuenta",
    label: "Cuenta",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="portal-bottom-nav">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`portal-nav-item${active ? " active" : ""}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
