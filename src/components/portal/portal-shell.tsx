import { ReactNode } from "react";
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
      <AppHeader avatarInitial={avatarInitial} isStaff={isStaff} />
      <div className="portal-content">{children}</div>
      <BottomNav />
    </div>
  );
}
