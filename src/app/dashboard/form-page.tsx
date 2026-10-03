import { ReactNode } from "react";

/** Full-page container for a data-entry screen (no popups — Santiago, 2 oct 2026). */
export function FormPage({ title, description, children, wide }: { title: string; description?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`p-4 md:p-8 space-y-4 ${wide ? "max-w-4xl" : "max-w-2xl"}`}>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="rounded-lg border bg-card p-5">{children}</div>
    </div>
  );
}
