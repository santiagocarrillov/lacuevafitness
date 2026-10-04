import Link from "next/link";
import { EVAL_COMPLETE_PCT, STATUS_COLOR, type EvalStatus } from "@/lib/srxfit/eval-score";
import { StatusBadge } from "./status-badge";

export type MemberEvalRow = {
  memberId: string;
  name: string;
  sede: string;
  status: EvalStatus;
  pct: number;
  lastEvalAt: string | null;
  testCount: number;
  hasBodyComp: boolean;
};

const SEDE_LABEL: Record<string, string> = {
  FITNESS_CENTER: "Fitness",
  XTREME: "Xtreme",
};

const ORDER: Record<EvalStatus, number> = { pendiente: 0, parcial: 1, evaluado: 2 };

export function sortEvalRows<T extends { status: EvalStatus; pct: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.pct - a.pct);
}

function Progress({ pct, status }: { pct: number; status: EvalStatus }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: STATUS_COLOR[status] }} />
        {/* the line every evaluation has to reach */}
        <div className="absolute inset-y-0 w-px bg-stone-400" style={{ left: `${EVAL_COMPLETE_PCT}%` }} />
      </div>
      <span className="w-9 text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function EvaluacionesTable({ members, openHref }: {
  members: MemberEvalRow[];
  /** URL that opens the evaluation panel for a socio. */
  openHref: (memberId: string) => string;
}) {
  const sorted = sortEvalRows(members);

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 font-medium">Socio</th>
            <th className="px-4 py-3 font-medium">Sede</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">Avance</th>
            <th className="hidden px-4 py-3 font-medium md:table-cell">Tests</th>
            <th className="hidden px-4 py-3 font-medium md:table-cell">Comp. corporal</th>
            <th className="hidden px-4 py-3 font-medium lg:table-cell">Última eval.</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => {
            const href = openHref(m.memberId);
            return (
              <tr key={m.memberId} className="group border-t transition hover:bg-stone-50">
                <td className="px-4 py-2.5">
                  <Link href={href} scroll={false} className="font-medium hover:underline">
                    {m.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{SEDE_LABEL[m.sede] ?? m.sede}</td>
                <td className="px-4 py-2.5"><StatusBadge status={m.status} /></td>
                <td className="px-4 py-2.5"><Progress pct={m.pct} status={m.status} /></td>
                <td className="hidden px-4 py-2.5 tabular-nums text-muted-foreground md:table-cell">
                  {m.testCount > 0 ? m.testCount : "—"}
                </td>
                <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">{m.hasBodyComp ? "✓" : "—"}</td>
                <td className="hidden px-4 py-2.5 text-xs text-muted-foreground lg:table-cell">
                  {m.lastEvalAt
                    ? new Date(m.lastEvalAt).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" })
                    : "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={href}
                    scroll={false}
                    className="whitespace-nowrap rounded-full border border-stone-200 px-3 py-1 text-xs font-medium hover:border-stone-400"
                  >
                    {m.status === "pendiente" ? "Iniciar" : "Ver / editar"} →
                  </Link>
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                No hay socios activos en este período.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
