import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getMemberEvalDetail, getOrStartEvaluation } from "@/lib/actions/srxfit";
import { TestForm, BodyCompForm, CompleteEvalButton } from "./eval-forms";

export const dynamic = "force-dynamic";

const LEVEL_LABELS: Record<string, string> = {
  LEVEL_1: "Nivel 1 · Principiante",
  LEVEL_2: "Nivel 2 · Intermedio",
  LEVEL_3: "Nivel 3 · Avanzado",
};

const EVAL_TYPE_LABELS: Record<string, string> = {
  ONBOARDING: "Onboarding",
  CYCLE_9_WEEK: "Ciclo 9 semanas",
  AD_HOC: "Ad hoc",
};

function secondsToTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const TIME_TESTS = new Set(["CHRISTINE_TIME_SECONDS", "ROW_500M_SPRINT_SECONDS"]);

function formatTestValue(test: string, value: number, unit: string): string {
  if (TIME_TESTS.has(test)) return secondsToTime(value);
  return `${value} ${unit}`;
}

export default async function MemberEvalPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{ from?: string; to?: string; type?: string }>;
}) {
  const user = await requireAuth();
  if (!can.editTests(user) && !can.manageMembers(user)) redirect("/dashboard/srxfit?forbidden=1");

  const { memberId } = await params;
  const sp = await searchParams;
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const evalType = (sp.type as "ONBOARDING" | "CYCLE_9_WEEK" | "AD_HOC") ?? "CYCLE_9_WEEK";

  const { member, evaluations } = await getMemberEvalDetail(memberId);
  const backHref = `/dashboard/srxfit/evaluaciones${from && to ? `?from=${from}&to=${to}` : ""}`;

  // Block test registration for inactive members (sin membresía activa).
  const isMemberActive = member.status === "ACTIVE" || member.status === "TRIAL";
  if (!isMemberActive) {
    return (
      <div className="p-8 max-w-2xl space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/dashboard/srxfit" className="hover:text-foreground">SRXFit</Link>
          <span>/</span>
          <Link href={backHref} className="hover:text-foreground">Evaluaciones</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{member.firstName} {member.lastName}</span>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
          <p className="font-semibold">Socio no cuenta con membresía activa.</p>
          <p>No se pueden registrar tests para socios inactivos. Reactiva la membresía desde el perfil del socio para continuar.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/socios/${memberId}`}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition"
          >
            Ir al perfil del socio →
          </Link>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border hover:bg-accent transition"
          >
            ← Volver a Evaluaciones
          </Link>
        </div>
      </div>
    );
  }

  // Get or open an evaluation (only for active socios)
  const activeEval = await getOrStartEvaluation(memberId, evalType);

  const currentLevel = member.trainingLevels[0]?.level;

  // Comparison: most recent completed eval before current
  const completedEvals = evaluations.filter((e) => e.completedAt && e.id !== activeEval.id);
  const prevEval = completedEvals[0] ?? null;

  // Build comparison delta for weight tests
  const prevTestMap = new Map(prevEval?.testResults.map((t) => [t.test, t.valueNumeric]) ?? []);
  const currTestMap = new Map(activeEval.testResults.map((t) => [t.test, t.valueNumeric]));

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/srxfit" className="hover:text-foreground">SRXFit</Link>
        <span>/</span>
        <Link href={backHref} className="hover:text-foreground">Evaluaciones</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{member.firstName} {member.lastName}</span>
      </div>

      {/* Member header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{member.firstName} {member.lastName}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{member.sede === "FITNESS_CENTER" ? "Fitness Center" : "Xtreme"}</span>
            {currentLevel && (
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                {LEVEL_LABELS[currentLevel] ?? currentLevel}
              </span>
            )}
            {member.email && <span>{member.email}</span>}
          </div>
        </div>
        {/* Eval type selector */}
        <div className="flex gap-1">
          {(["ONBOARDING", "CYCLE_9_WEEK", "AD_HOC"] as const).map((t) => (
            <Link
              key={t}
              href={`/dashboard/srxfit/evaluaciones/${memberId}?from=${from}&to=${to}&type=${t}`}
              className={`px-2.5 py-1 text-xs rounded-md border transition ${
                evalType === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-accent"
              }`}
            >
              {EVAL_TYPE_LABELS[t]}
            </Link>
          ))}
        </div>
      </div>

      {/* Current evaluation info */}
      <div className="rounded-lg border p-4 bg-muted/20 flex items-center justify-between gap-4 flex-wrap">
        <div className="text-sm space-y-0.5">
          <p className="font-medium">
            Evaluación activa — {EVAL_TYPE_LABELS[activeEval.type]}
            {activeEval.cycleNumber ? ` · Ciclo ${activeEval.cycleNumber}` : ""}
          </p>
          <p className="text-muted-foreground text-xs">
            Iniciada {new Date(activeEval.startedAt).toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" })}
            {activeEval.completedAt && ` · Completada ${new Date(activeEval.completedAt).toLocaleDateString("es-EC", { day: "2-digit", month: "short" })}`}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {activeEval.testResults.length} / 13 tests registrados
        </p>
      </div>

      {/* Comparison with previous eval */}
      {prevEval && prevEval.testResults.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Comparativa — eval. anterior ({new Date(prevEval.startedAt).toLocaleDateString("es-EC", { month: "short", year: "numeric" })})
          </h2>
          <div className="rounded-lg border divide-y divide-border">
            {prevEval.testResults.map((prev) => {
              const curr = currTestMap.get(prev.test);
              const delta = curr !== undefined ? curr - prev.valueNumeric : null;
              const isPositive = delta !== null && delta > 0;
              const isNegative = delta !== null && delta < 0;
              return (
                <div key={prev.test} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground text-xs">{prev.test.replace(/_/g, " ")}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">{formatTestValue(prev.test, prev.valueNumeric, prev.unit)}</span>
                    <span className="font-medium">{curr !== undefined ? formatTestValue(prev.test, curr, prev.unit) : "—"}</span>
                    {delta !== null && delta !== 0 && (
                      <span className={`text-xs font-medium ${isPositive ? "text-green-700" : isNegative ? "text-red-600" : ""}`}>
                        {isPositive ? "+" : ""}{delta.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Test form */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Batería de tests
        </h2>
        <TestForm
          evaluationId={activeEval.id}
          memberId={memberId}
          currentResults={activeEval.testResults}
        />
      </section>

      {/* Body composition */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Composición corporal
        </h2>
        <BodyCompForm
          evaluationId={activeEval.id}
          memberId={memberId}
          current={activeEval.bodyCompositions[0] ?? undefined}
        />
      </section>

      {/* Complete eval */}
      <CompleteEvalButton
        evaluationId={activeEval.id}
        memberId={memberId}
        isCompleted={!!activeEval.completedAt}
      />

      {/* History */}
      {completedEvals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Historial ({completedEvals.length} evaluaciones)
          </h2>
          <div className="rounded-lg border divide-y divide-border">
            {completedEvals.map((ev) => (
              <div key={ev.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{EVAL_TYPE_LABELS[ev.type]}</span>
                  {ev.cycleNumber && <span className="text-muted-foreground ml-2">Ciclo {ev.cycleNumber}</span>}
                  {ev.coach && <span className="text-muted-foreground ml-2">· Coach: {ev.coach.fullName}</span>}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">{ev.testResults.length} tests</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(ev.startedAt).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                  {ev.completedAt && (
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs">Completada</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
