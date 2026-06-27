import { ReactNode } from "react";
import Link from "next/link";
import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";
import { getCurrentUser } from "@/lib/auth";

type Props = {
  avatarInitial: string;
  children: ReactNode;
};

export async function PortalShell({ avatarInitial, children }: Props) {
  // Staff previewing their own athlete view get a way back to the dashboard.
  const user = await getCurrentUser();
  const isStaff = user != null && user.role !== "MEMBER";

  return (
    <div className="portal-shell">
      {isStaff && (
        <Link
          href="/dashboard"
          style={{
            display: "block",
            textAlign: "center",
            fontSize: 12,
            padding: "7px 12px",
            background: "var(--pt-ink-1)",
            color: "var(--pt-bg-page)",
            textDecoration: "none",
            fontFamily: "var(--pt-font-mono)",
            letterSpacing: "0.04em",
          }}
        >
          Vista de socio · ← Volver al panel
        </Link>
      )}
      <AppHeader avatarInitial={avatarInitial} />
      <div className="portal-content">{children}</div>
      <BottomNav />
    </div>
  );
}
