import { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";

type Props = {
  avatarInitial: string;
  children: ReactNode;
};

export function PortalShell({ avatarInitial, children }: Props) {
  return (
    <div className="portal-shell">
      <AppHeader avatarInitial={avatarInitial} />
      <div className="portal-content">{children}</div>
      <BottomNav />
    </div>
  );
}
