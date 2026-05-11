import Link from "next/link";

type MemberStatus = {
  memberId: string;
  name: string;
  sede: string;
  status: "evaluado" | "parcial" | "pendiente";
  evalId: string | null;
  lastEvalAt: string | null;
  completedAt: string | null;
  testCount: number;
  hasBodyComp: boolean;
};

const STATUS_STYLES = {
  evaluado: "bg-green-100 text-green-800",
  parcial: "bg-amber-100 text-amber-800",
  pendiente: "bg-zinc-100 text-zinc-600",
};

const STATUS_LABEL = {
  evaluado: "Evaluado",
  parcial: "Parcial",
  pendiente: "Pendiente",
};

const SEDE_LABEL: Record<string, string> = {
  FITNESS_CENTER: "Fitness",
  XTREME: "Xtreme",
};

export function EvaluacionesTable({ members, from, to }: {
  members: MemberStatus[];
  from: string;
  to: string;
}) {
  const sorted = [...members].sort((a, b) => {
    const order = { pendiente: 0, parcial: 1, evaluado: 2 };
    return order[a.status] - order[b.status];
  });

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Socio</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sede</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tests</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Comp. corporal</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Última eval.</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((m) => (
            <tr key={m.memberId} className="hover:bg-muted/30 transition">
              <td className="px-4 py-3 font-medium">{m.name}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {SEDE_LABEL[m.sede] ?? m.sede}
              </td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[m.status]}`}>
                  {STATUS_LABEL[m.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {m.testCount > 0 ? `${m.testCount} / 13` : "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {m.hasBodyComp ? "✓" : "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground text-xs">
                {m.lastEvalAt
                  ? new Date(m.lastEvalAt).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" })
                  : "—"}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/srxfit/evaluaciones/${m.memberId}?from=${from}&to=${to}`}
                  className="text-xs text-primary hover:underline whitespace-nowrap"
                >
                  {m.status === "pendiente" ? "Iniciar" : "Ver / editar"} →
                </Link>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                No hay socios activos en este período.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
