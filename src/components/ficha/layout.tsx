import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * La ficha única de una persona (lead o socio), al estilo HubSpot / Gambit:
 * quién es a la izquierda, qué ha pasado en el centro (la columna ancha) y lo
 * que tiene asociado a la derecha. En escritorio cada columna se desplaza por
 * su cuenta para que la línea de tiempo no arrastre a las otras dos; en el
 * celular (recepción, con alguien enfrente) las tres se apilan.
 */
export function FichaLayout({
  left,
  about,
  center,
  right,
}: {
  /** Identidad + acciones rápidas. */
  left: ReactNode;
  /** Propiedades (sobre, origen…): bajo la identidad en escritorio, al final en el celular. */
  about?: ReactNode;
  center: ReactNode;
  right: ReactNode;
}) {
  return (
    <div className="lg:grid lg:h-[calc(100dvh-2.75rem)] lg:grid-cols-[300px_minmax(0,1fr)_320px] 2xl:grid-cols-[340px_minmax(0,1fr)_380px]">
      <aside className="border-b border-border bg-card lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        {left}
        {about && <div className="hidden lg:block">{about}</div>}
      </aside>
      <section className="min-w-0 bg-muted px-4 pb-16 md:px-6 lg:min-h-0 lg:overflow-y-auto">{center}</section>
      <aside className="border-t border-border bg-card lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">{right}</aside>
      {about && <div className="border-t border-border bg-card pb-8 lg:hidden">{about}</div>}
    </div>
  );
}

/** Sección plegable de las columnas laterales. */
export function FichaSection({
  title,
  count,
  action,
  children,
  defaultOpen = true,
  id,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  id?: string;
}) {
  return (
    <div id={id} className="relative border-t border-border first:border-t-0">
      <details open={defaultOpen} className="group/section">
        <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 px-4 py-3 pr-24 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-3.5 -rotate-90 text-muted-foreground transition group-open/section:rotate-0" />
          <span className="text-[13px] font-semibold">{title}</span>
          {count !== undefined && <span className="text-xs text-muted-foreground">({count})</span>}
        </summary>
        <div className="px-4 pb-4">{children}</div>
      </details>
      {action && <div className="absolute right-3 top-2">{action}</div>}
    </div>
  );
}

/** "Data highlights": el resumen de una línea de quién es y en qué va. */
export function Highlights({ items }: { items: { label: string; value: ReactNode; hint?: ReactNode; href?: string }[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-px overflow-hidden rounded-lg border border-border bg-border shadow-sm">
      {items.map((it) => {
        const inner = (
          <>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{it.label}</div>
            <div className="mt-1 text-sm font-semibold">{it.value}</div>
            {it.hint && <div className="mt-0.5 text-xs text-muted-foreground">{it.hint}</div>}
          </>
        );
        return it.href ? (
          <Link key={it.label} href={it.href} className="min-w-[100px] flex-1 basis-[100px] bg-card px-3 py-3 transition hover:bg-muted/50">
            {inner}
          </Link>
        ) : (
          <div key={it.label} className="min-w-[100px] flex-1 basis-[100px] bg-card px-3 py-3">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export type Prop = { label: string; value?: ReactNode; href?: string; external?: boolean };

/** Propiedades en lista: etiqueta gris pequeña y el valor debajo; lo vacío es "--". */
export function PropList({ props }: { props: Prop[] }) {
  return (
    <dl className="space-y-3">
      {props.map((p) => {
        const empty = p.value == null || p.value === "";
        return (
          <div key={p.label}>
            <dt className="text-xs text-muted-foreground">{p.label}</dt>
            <dd className="mt-0.5 break-words text-sm">
              {empty ? (
                <span className="text-muted-foreground">--</span>
              ) : p.href ? (
                p.external ? (
                  <a href={p.href} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                    {p.value}
                  </a>
                ) : (
                  <Link href={p.href} className="font-medium text-primary hover:underline">
                    {p.value}
                  </Link>
                )
              ) : (
                p.value
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function Initials({ name, size = 52 }: { name: string; size?: number }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {letters || "?"}
    </div>
  );
}

/** Fila de botones redondos (Nota · WhatsApp · Llamar · Tarea…): registrar o iniciar sin salir de la ficha. */
export function QuickActions({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-6 gap-y-3">{children}</div>;
}

export function QuickAction({
  href,
  label,
  icon,
  external,
  disabled,
  title,
}: {
  href?: string;
  label: string;
  icon: ReactNode;
  external?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const circle = (
    <span className="flex size-8 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
      {icon}
    </span>
  );
  const cls = "group flex min-w-0 flex-col items-center gap-1 text-[10.5px] font-medium text-muted-foreground";
  if (disabled || !href) {
    return (
      <span className={`${cls} cursor-not-allowed opacity-40`} title={title}>
        {circle}
        {label}
      </span>
    );
  }
  return external ? (
    <a href={href} className={cls} title={title} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
      {circle}
      {label}
    </a>
  ) : (
    <Link href={href} className={cls} title={title}>
      {circle}
      {label}
    </Link>
  );
}

/** Pestañas de la columna central como enlaces (?tab=), para que cada una tenga su URL. */
export function FichaTabs({ tabs, active, base }: { tabs: { key: string; label: string; count?: number }[]; active: string; base: string }) {
  return (
    <nav className="sticky top-12 z-10 -mx-4 flex gap-1 overflow-x-auto md:top-11 lg:top-0 border-b border-border bg-muted/95 px-4 backdrop-blur md:-mx-6 md:px-6">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === tabs[0].key ? base : `${base}?tab=${t.key}`}
          scroll={false}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
            active === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
          {t.count ? <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** Teléfono → enlace de WhatsApp (wa.me). Celulares ecuatorianos "09…" → 5939…. */
export function waLink(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return undefined;
  const intl = digits.startsWith("593") ? digits : digits.startsWith("0") ? `593${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

export function telLink(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
