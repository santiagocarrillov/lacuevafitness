import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMainSet } from "@/lib/self-log/main-set";
import { MIN_TREND_SESSIONS, type LiftTrend } from "@/lib/srxfit/strength-trend";
import type { MemberStrength } from "@/lib/srxfit/member-strength";

const STEP_CLASS = {
  half: "border-emerald-200 text-emerald-700",
  down: "border-amber-200 text-amber-700",
  base: "text-muted-foreground",
  up: "border-blue-200 text-blue-700",
} as const;

const TREND = {
  up: { label: "↑ Sube", className: "border-emerald-200 text-emerald-600" },
  flat: { label: "→ Estable", className: "text-muted-foreground" },
  down: { label: "↓ Baja", className: "border-red-200 text-red-600" },
} as const;

// Stored as UTC date-only values: read them back in UTC.
const day = (d: Date) => d.toLocaleDateString("es-EC", { day: "numeric", month: "short", timeZone: "UTC" });

function Sparkline({ values }: { values: number[] }) {
  const w = 96;
  const h = 24;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="text-primary">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Lift({ lift }: { lift: LiftTrend }) {
  const first = lift.points[0].e1rm;
  const last = lift.points[lift.points.length - 1].e1rm;
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return (
    <div className="space-y-1 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{lift.exercise}</p>
        {lift.trend ? (
          <Badge variant="outline" className={`text-xs ${TREND[lift.trend.direction].className}`}>
            {TREND[lift.trend.direction].label}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {lift.sessions} de {MIN_TREND_SESSIONS} sesiones
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Última: {formatMainSet(lift.last)} · {day(lift.last.date)}
      </p>
      {lift.trend ? (
        <div className="flex items-end justify-between gap-2 pt-1">
          <div>
            <p className="text-lg font-semibold leading-tight">
              {last} <span className="text-sm font-normal text-muted-foreground">kg de 1RM estimado</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Empezó en {first} kg · tendencia {sign(lift.trend.deltaKg)} kg ({sign(lift.trend.pct)} %) en {lift.sessions} sesiones
            </p>
          </div>
          <Sparkline values={lift.points.map((p) => p.e1rm)} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">1RM estimado {last} kg. La tendencia aparece con {MIN_TREND_SESSIONS} sesiones.</p>
      )}
    </div>
  );
}

/**
 * Staff view of the socio's strength (Manual SRXFIT v3, 8.4 and 9.5): today's
 * station suggestion, as the socio reads it in the portal, and the estimated
 * 1RM trend of each main lift. Only official sets count.
 */
export function StrengthSection({
  memberId,
  strength,
  canRegister,
  memberIsActive,
  showProfile,
}: {
  memberId: string;
  strength: MemberStrength;
  canRegister: boolean;
  memberIsActive: boolean;
  /** The profile derives from the hormonal stage (clinical data): only whoever may read health data sees it. */
  showProfile: boolean;
}) {
  const { prescription: p, trends, pending } = strength;
  return (
    <Card id="fuerza" className="scroll-mt-16">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Fuerza · serie principal</CardTitle>
          <CardDescription>Mejor serie del ejercicio principal de cada día. Solo cuentan las series validadas o anotadas por el equipo.</CardDescription>
        </div>
        {canRegister && memberIsActive && (
          <Link
            href={`/dashboard/socios/${memberId}/serie`}
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-input px-3 text-sm font-medium transition hover:bg-accent"
          >
            + Registrar serie
          </Link>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {p && (
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Sugerencia de hoy · estaciones</span>
              <Badge variant="outline" className={`text-xs ${STEP_CLASS[p.step]}`}>
                {p.headline}
              </Badge>
              {showProfile && p.profile && <span className="text-xs text-muted-foreground">Perfil {p.profile}</span>}
              {p.rule && <span className="text-xs text-muted-foreground">Regla {p.rule}</span>}
            </div>
            {p.reasons.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{p.reasons.join(" ")}</p>}
            {showProfile && p.priorities.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Prioridades: {p.priorities.join(" ")}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              Es lo que el socio ve en su app. Tú decides en clase: si le duele algo o está en déficit calórico, baja un paso.
            </p>
          </div>
        )}

        {trends.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin series oficiales todavía. El socio las anota en su app (Hoy) o las registras tú aquí.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {trends.map((lift) => (
              <Lift key={lift.exercise} lift={lift} />
            ))}
          </div>
        )}

        {pending > 0 && (
          <p className="text-xs text-amber-700">
            {pending === 1 ? "1 serie anotada por el socio espera" : `${pending} series anotadas por el socio esperan`} validación y no{" "}
            {pending === 1 ? "entra" : "entran"} en la tendencia.{" "}
            <Link href="/dashboard/srxfit/validar" className="underline">
              Ir a Por validar
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
