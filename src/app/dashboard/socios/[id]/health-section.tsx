"use client";

import { useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeAge, bmi, whtr, trigHdl, trend,
  evaluateBodyFat, evaluateMusclePct, evaluateWaist, evaluateWHtR, evaluateBMI,
  evaluateGlucose, evaluateTrigHdl, evaluateHsCRP, evaluateTestosterone, evaluateEstradiol,
  bandsBfRange, bandsMmRange, bandsWaistRange, bandsTestosteroneRange,
  longevityScore, recommendations,
  STATUS_STYLES,
  type Status, type Sex, type MenoStatus, type RangeSpec, type TrendInfo,
} from "@/lib/health-ranges";
import { deleteBodyComp, deleteClinicalMarker, updateMemberSex } from "@/lib/actions/health";
import { musclePct } from "./health-forms";

type BodyComp = {
  id: string;
  measuredAt: Date | string;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  muscleMassPct: number | null;
  waistCm: number | null;
  hipCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  basalMetabolism: number | null;
  notes: string | null;
  recordedBy?: { fullName: string } | null;
};

type ClinicalMarker = {
  id: string;
  measuredAt: Date | string;
  glucoseFasting: number | null;
  triglycerides: number | null;
  hdlCholesterol: number | null;
  hsCRP: number | null;
  testosteroneFree: number | null;
  estradiolE2: number | null;
  cycleDay: number | null;
  menopausalStatus: MenoStatus | null;
  notes: string | null;
  recordedBy?: { fullName: string } | null;
};

type Props = {
  memberId: string;
  memberName: string;
  dateOfBirth: Date | string | null;
  sex: Sex | null;
  bodyComps: BodyComp[];
  clinicalMarkers: ClinicalMarker[];
  canEdit: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────

// ─── Small UI primitives ─────────────────────────────────────────────

function StatusDot({ s }: { s: Status }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${STATUS_STYLES[s].dot}`} />;
}

function StatusPill({ s, children }: { s: Status; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border ${STATUS_STYLES[s].pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLES[s].dot}`} />
      {children}
    </span>
  );
}

function TrendArrow({ t }: { t: TrendInfo }) {
  if (t.dir === "none") return <span className="text-xs text-muted-foreground">—</span>;
  const cls =
    t.isPositive === true ? "text-emerald-700"
    : t.isPositive === false ? "text-red-600"
    : "text-muted-foreground";
  const sign = t.pctChange != null && Math.abs(t.pctChange) >= 0.05 ? `${t.pctChange > 0 ? "+" : ""}${t.pctChange.toFixed(1)}%` : "";
  return (
    <span className={`text-xs font-medium ${cls}`}>
      {t.arrow} {sign}
    </span>
  );
}

function RangeBox({ r, label }: { r: RangeSpec | null; label: string }) {
  if (!r) {
    return (
      <div className="text-[11px] text-muted-foreground italic">
        Configura sexo {label === "Testosterona libre" || label === "Estradiol E2" ? "y datos clínicos " : ""}para ver rangos.
      </div>
    );
  }
  return (
    <div className="text-[11px] space-y-0.5">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span className="text-emerald-700">🟢 {r.bands.green}</span>
        <span className="text-amber-700">🟡 {r.bands.yellow}</span>
        <span className="text-red-600">🔴 {r.bands.red}</span>
      </div>
      {r.note && <p className="text-muted-foreground italic">{r.note}</p>}
    </div>
  );
}

function MetricCard({
  label, value, unit, status, trendInfo, range,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  status?: Status;
  trendInfo?: TrendInfo;
  range?: RangeSpec | null;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {status && <StatusDot s={status} />}
      </div>
      <p className="text-xl font-semibold">
        {value ?? "—"}
        {value != null && unit && <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>}
      </p>
      <div className="flex items-center gap-2 min-h-[18px]">
        {trendInfo && <TrendArrow t={trendInfo} />}
      </div>
      {range && (
        <details>
          <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground select-none">
            Rangos
          </summary>
          <div className="mt-1.5"><RangeBox r={range} label={label} /></div>
        </details>
      )}
    </div>
  );
}

// ─── Main section ────────────────────────────────────────────────────

export function HealthSection({
  memberId, memberName, dateOfBirth, sex, bodyComps, clinicalMarkers, canEdit,
}: Props) {
  const router = useRouter();
  const base = `/dashboard/socios/${memberId}`;
  const [, startTr] = useTransition();

  const age = computeAge(dateOfBirth);

  const bcDesc = useMemo(
    () => bodyComps.slice().sort((a, b) => +new Date(b.measuredAt) - +new Date(a.measuredAt)),
    [bodyComps],
  );
  const cmDesc = useMemo(
    () => clinicalMarkers.slice().sort((a, b) => +new Date(b.measuredAt) - +new Date(a.measuredAt)),
    [clinicalMarkers],
  );
  const latestBC = bcDesc[0];
  const prevBC = bcDesc[1];
  const firstBC = bcDesc[bcDesc.length - 1];
  const latestCM = cmDesc[0];
  const prevCM = cmDesc[1];

  const currBmi = latestBC?.weightKg && latestBC?.heightCm ? bmi(latestBC.weightKg, latestBC.heightCm) : null;
  const prevBmi = prevBC?.weightKg && prevBC?.heightCm ? bmi(prevBC.weightKg, prevBC.heightCm) : null;
  const currWHtR = latestBC?.waistCm && latestBC?.heightCm ? whtr(latestBC.waistCm, latestBC.heightCm) : null;
  const prevWHtR = prevBC?.waistCm && prevBC?.heightCm ? whtr(prevBC.waistCm, prevBC.heightCm) : null;
  const currMusclePct = latestBC ? musclePct(latestBC) : null;
  const prevMusclePct = prevBC ? musclePct(prevBC) : null;

  const currTrigHdl = latestCM?.triglycerides && latestCM?.hdlCholesterol
    ? trigHdl(latestCM.triglycerides, latestCM.hdlCholesterol) : null;
  const prevTrigHdl = prevCM?.triglycerides && prevCM?.hdlCholesterol
    ? trigHdl(prevCM.triglycerides, prevCM.hdlCholesterol) : null;

  const bfStatus = evaluateBodyFat(latestBC?.bodyFatPct, age, sex);
  const mmStatus = evaluateMusclePct(currMusclePct, age, sex);
  const waistStatus = evaluateWaist(latestBC?.waistCm, sex);
  const whtrStatus = evaluateWHtR(currWHtR);
  const bmiStatus = evaluateBMI(currBmi);
  const glucStatus = evaluateGlucose(latestCM?.glucoseFasting);
  const trigStatus = evaluateTrigHdl(currTrigHdl);
  const crpStatus = evaluateHsCRP(latestCM?.hsCRP);
  const testStatus = evaluateTestosterone(latestCM?.testosteroneFree, age, sex);
  const e2Status = evaluateEstradiol(latestCM?.estradiolE2, sex, latestCM?.menopausalStatus ?? null, latestCM?.cycleDay ?? null);

  const score = longevityScore({
    glucose: glucStatus.status, trigHdl: trigStatus.status, hsCRP: crpStatus.status,
    testosterone: testStatus.status, estradiol: e2Status.status,
    waist: waistStatus.status, whtr: whtrStatus.status,
  });

  const recs = recommendations({
    glucose: glucStatus.status, trigHdl: trigStatus.status, hsCRP: crpStatus.status,
    waist: waistStatus.status, testosterone: testStatus.status,
  });

  const tWeight = trend(latestBC?.weightKg, prevBC?.weightKg, "neutral");
  const weightDelta = latestBC?.weightKg && firstBC?.weightKg && firstBC.id !== latestBC.id
    ? latestBC.weightKg - firstBC.weightKg : null;
  const tBF = trend(latestBC?.bodyFatPct, prevBC?.bodyFatPct, "down");
  const tWaist = trend(latestBC?.waistCm, prevBC?.waistCm, "down");
  const tWHtR = trend(currWHtR, prevWHtR, "down");
  const tGluc = trend(latestCM?.glucoseFasting, prevCM?.glucoseFasting, "down");
  const tMM = trend(currMusclePct, prevMusclePct, "up");
  const tTrigHdl = trend(currTrigHdl, prevTrigHdl, "down");
  const tCRP = trend(latestCM?.hsCRP, prevCM?.hsCRP, "down");
  const tTest = trend(latestCM?.testosteroneFree, prevCM?.testosteroneFree, "up");
  const tBMI = trend(currBmi, prevBmi, "neutral");

  function setSex(s: Sex | "") {
    startTr(async () => {
      try {
        await updateMemberSex(memberId, s || null);
        toast.success("Datos actualizados.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  function handleDeleteBC(id: string) {
    if (!confirm("¿Eliminar esta medición?")) return;
    startTr(async () => {
      try { await deleteBodyComp(id, memberId); toast.success("Eliminada."); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    });
  }
  function handleDeleteCM(id: string) {
    if (!confirm("¿Eliminar este registro?")) return;
    startTr(async () => {
      try { await deleteClinicalMarker(id, memberId); toast.success("Eliminado."); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    });
  }

  const bfRange = age && sex && sex !== "OTHER" ? bandsBfRange(age, sex) : null;
  const mmRange = age && sex && sex !== "OTHER" ? bandsMmRange(age, sex) : null;
  const waistRange = sex && sex !== "OTHER" ? bandsWaistRange(sex) : null;
  const testRange = age && sex === "MALE" ? bandsTestosteroneRange(age, sex) : null;

  return (
    <div className="space-y-4">
      {(!sex || !age) && (
        <Card>
          <CardContent className="py-4 space-y-2">
            <p className="text-sm">
              <span className="font-medium">Faltan datos demográficos para calcular rangos:</span>{" "}
              {!age && "fecha de nacimiento"}{!age && !sex && " y "}{!sex && "sexo biológico"}.
            </p>
            {!sex && canEdit && (
              <div className="flex items-center gap-2">
                <Label className="text-xs">Sexo biológico:</Label>
                <select onChange={(e) => setSex(e.target.value as Sex | "")} defaultValue=""
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">—</option>
                  <option value="MALE">Masculino</option>
                  <option value="FEMALE">Femenino</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 6-card dashboard */}
      <Card>
        <CardHeader>
          <CardTitle>Salud — {memberName}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {sex === "MALE" ? "Hombre" : sex === "FEMALE" ? "Mujer" : "—"}
            {age != null ? ` · ${age} años` : ""}
            {" · "}{bodyComps.length} mediciones · {clinicalMarkers.length} laboratorios
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Peso" value={latestBC?.weightKg ?? null} unit="kg" trendInfo={tWeight} />
          <MetricCard
            label="Δ Peso (vs. inicio)"
            value={weightDelta != null ? `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}` : null}
            unit="kg"
          />
          <MetricCard label="% Grasa" value={latestBC?.bodyFatPct ?? null} unit="%"
            status={bfStatus.status} trendInfo={tBF} range={bfStatus.range ?? bfRange} />
          <MetricCard label="Cintura" value={latestBC?.waistCm ?? null} unit="cm"
            status={waistStatus.status} trendInfo={tWaist} range={waistStatus.range ?? waistRange} />
          <MetricCard label="C/A" value={currWHtR != null ? currWHtR.toFixed(2) : null}
            status={whtrStatus.status} trendInfo={tWHtR} range={whtrStatus.range} />
          <MetricCard label="Glucosa" value={latestCM?.glucoseFasting ?? null} unit="mg/dL"
            status={glucStatus.status} trendInfo={tGluc} range={glucStatus.range} />
        </CardContent>
      </Card>

      {/* Composición corporal */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Composición corporal</CardTitle>
          {canEdit && (
            <Link href={`${base}/medicion/nueva`} className="inline-flex items-center justify-center rounded-md border border-input bg-background text-sm font-medium h-7 px-2.5 hover:bg-accent transition">
              + Registrar medición
            </Link>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-amber-50/40 px-3 py-2 text-xs text-amber-800">
            <strong>IMC:</strong> tiene limitaciones para deportistas. Músculo pesa más que grasa. Usar junto con % grasa y cintura.
          </div>

          {latestBC && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              <IndicatorRow label="IMC" value={currBmi != null ? currBmi.toFixed(1) : null} status={bmiStatus.status} range={bmiStatus.range} trendInfo={tBMI} />
              <IndicatorRow label="% Grasa" value={latestBC.bodyFatPct} status={bfStatus.status} range={bfStatus.range ?? bfRange} trendInfo={tBF} unit="%" />
              <IndicatorRow label="% Músculo" value={currMusclePct != null ? currMusclePct.toFixed(1) : null} status={mmStatus.status} range={mmStatus.range ?? mmRange} trendInfo={tMM} unit="%" />
              <IndicatorRow label="Cintura" value={latestBC.waistCm} status={waistStatus.status} range={waistStatus.range ?? waistRange} trendInfo={tWaist} unit="cm" />
              <IndicatorRow label="C/A" value={currWHtR != null ? currWHtR.toFixed(2) : null} status={whtrStatus.status} range={whtrStatus.range} trendInfo={tWHtR} />
              <IndicatorRow label="Met. basal" value={latestBC.basalMetabolism} unit="kcal" />
            </div>
          )}

          {bcDesc.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin mediciones.</p>
          ) : (
            <div className="rounded-md border divide-y overflow-x-auto">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-[10px] font-medium uppercase text-muted-foreground min-w-[700px]">
                <div className="col-span-2">Fecha</div>
                <div>Peso</div><div>Altura</div><div>%Grasa</div><div>%Músc.</div><div>Cintura</div>
                <div>IMC</div><div>C/A</div><div className="col-span-2">Notas</div>
                {canEdit && <div className="text-right col-span-1">·</div>}
              </div>
              {bcDesc.map((bc) => {
                const _bmi = bc.weightKg && bc.heightCm ? bmi(bc.weightKg, bc.heightCm) : null;
                const _whtr = bc.waistCm && bc.heightCm ? whtr(bc.waistCm, bc.heightCm) : null;
                const _mm = musclePct(bc);
                const sBF = evaluateBodyFat(bc.bodyFatPct, age, sex).status;
                const sMM = evaluateMusclePct(_mm, age, sex).status;
                const sWaist = evaluateWaist(bc.waistCm, sex).status;
                const sBMI = evaluateBMI(_bmi).status;
                const sWHtR = evaluateWHtR(_whtr).status;
                return (
                  <div key={bc.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs items-center min-w-[700px]">
                    <div className="col-span-2 font-medium">{new Date(bc.measuredAt).toLocaleDateString("es-EC")}</div>
                    <div>{bc.weightKg ?? "—"}</div>
                    <div>{bc.heightCm ?? "—"}</div>
                    <CellWithStatus value={bc.bodyFatPct} status={sBF} />
                    <CellWithStatus value={_mm != null ? _mm.toFixed(1) : null} status={sMM} />
                    <CellWithStatus value={bc.waistCm} status={sWaist} />
                    <CellWithStatus value={_bmi != null ? _bmi.toFixed(1) : null} status={sBMI} />
                    <CellWithStatus value={_whtr != null ? _whtr.toFixed(2) : null} status={sWHtR} />
                    <div className="col-span-2 text-muted-foreground italic truncate">{bc.notes ?? ""}</div>
                    {canEdit && (
                      <div className="text-right text-[11px] flex gap-2 justify-end">
                        <Link href={`${base}/medicion/${bc.id}`} className="text-muted-foreground hover:text-foreground">
                          editar
                        </Link>
                        <button onClick={() => handleDeleteBC(bc.id)} className="text-red-600 hover:text-red-700">
                          eliminar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Longevidad clínica */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Longevidad clínica</CardTitle>
          {canEdit && (
            <Link href={`${base}/laboratorio/nuevo`} className="inline-flex items-center justify-center rounded-md border border-input bg-background text-sm font-medium h-7 px-2.5 hover:bg-accent transition">
              + Registrar laboratorio
            </Link>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-blue-50/50 px-3 py-2 text-xs text-blue-900">
            ⚕️ <strong>IMPORTANTE:</strong> Los marcadores clínicos son para seguimiento educativo y nutricional. NO reemplazan evaluación médica. Valores en zona roja o amarilla persistentes requieren consulta con profesional de salud calificado. La Cueva no diagnostica ni trata enfermedades.
          </div>

          <div className={`rounded-md border px-4 py-3 ${STATUS_STYLES[score.status].pill}`}>
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <p className="text-sm">
                <span className="font-semibold">Score de longevidad:</span>{" "}
                {score.greens} / {score.max} indicadores en verde{score.evaluated < 7 ? ` · ${score.evaluated} evaluados` : ""}
              </p>
              <StatusPill s={score.status}>
                {score.status === "green" ? "Buen camino" : score.status === "yellow" ? "Zona de mejora" : "Riesgo metabólico"}
              </StatusPill>
            </div>
            <p className="text-xs mt-1">{score.interpretation}</p>
            <p className="text-[11px] mt-2 italic opacity-80">
              Tendencia &gt; foto aislada · una sola medición no define progreso. Lo importante es la dirección sostenida en 9-18 semanas.
            </p>
          </div>

          {recs.length > 0 && (
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Recomendaciones automáticas</p>
              <ul className="space-y-0.5 text-sm list-disc list-inside">
                {recs.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          {latestCM && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <IndicatorRow label="Glucosa" value={latestCM.glucoseFasting} status={glucStatus.status} range={glucStatus.range} trendInfo={tGluc} unit="mg/dL" />
              <IndicatorRow label="Trig/HDL" value={currTrigHdl != null ? currTrigHdl.toFixed(2) : null} status={trigStatus.status} range={trigStatus.range} trendInfo={tTrigHdl} />
              <IndicatorRow label="PCR-us" value={latestCM.hsCRP} status={crpStatus.status} range={crpStatus.range} trendInfo={tCRP} unit="mg/L" />
              <IndicatorRow label="Testosterona libre" value={latestCM.testosteroneFree} status={testStatus.status} range={testStatus.range ?? testRange} trendInfo={tTest} unit="ng/dL" />
              <IndicatorRow label="Estradiol E2" value={latestCM.estradiolE2} status={e2Status.status} range={e2Status.range} unit="pg/mL" />
              <IndicatorRow label="Triglicéridos" value={latestCM.triglycerides} unit="mg/dL" />
              <IndicatorRow label="HDL" value={latestCM.hdlCholesterol} unit="mg/dL" />
            </div>
          )}

          {cmDesc.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin laboratorios registrados.</p>
          ) : (
            <div className="rounded-md border divide-y overflow-x-auto">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-[10px] font-medium uppercase text-muted-foreground min-w-[700px]">
                <div className="col-span-2">Fecha</div>
                <div>Glucosa</div><div>Trig</div><div>HDL</div><div>Trig/HDL</div>
                <div>PCR</div><div>Test</div><div>E2</div>
                <div className="col-span-2">Notas</div>
                {canEdit && <div className="text-right col-span-1">·</div>}
              </div>
              {cmDesc.map((cm) => {
                const _th = cm.triglycerides && cm.hdlCholesterol ? trigHdl(cm.triglycerides, cm.hdlCholesterol) : null;
                const sG = evaluateGlucose(cm.glucoseFasting).status;
                const sTH = evaluateTrigHdl(_th).status;
                const sCRP = evaluateHsCRP(cm.hsCRP).status;
                const sT = evaluateTestosterone(cm.testosteroneFree, age, sex).status;
                const sE = evaluateEstradiol(cm.estradiolE2, sex, cm.menopausalStatus, cm.cycleDay).status;
                return (
                  <div key={cm.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs items-center min-w-[700px]">
                    <div className="col-span-2 font-medium">{new Date(cm.measuredAt).toLocaleDateString("es-EC")}</div>
                    <CellWithStatus value={cm.glucoseFasting} status={sG} />
                    <div>{cm.triglycerides ?? "—"}</div>
                    <div>{cm.hdlCholesterol ?? "—"}</div>
                    <CellWithStatus value={_th != null ? _th.toFixed(2) : null} status={sTH} />
                    <CellWithStatus value={cm.hsCRP} status={sCRP} />
                    <CellWithStatus value={cm.testosteroneFree} status={sT} />
                    <CellWithStatus value={cm.estradiolE2} status={sE} />
                    <div className="col-span-2 text-muted-foreground italic truncate">{cm.notes ?? ""}</div>
                    {canEdit && (
                      <div className="text-right text-[11px] flex gap-2 justify-end">
                        <Link href={`${base}/laboratorio/${cm.id}`} className="text-muted-foreground hover:text-foreground">
                          editar
                        </Link>
                        <button onClick={() => handleDeleteCM(cm.id)} className="text-red-600 hover:text-red-700">
                          eliminar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-4 text-xs text-muted-foreground space-y-2">
          <p>
            Algunos indicadores (grasa, músculo, hormonas) se ajustan por edad porque el cuerpo cambia naturalmente.
            Otros (cintura, glucosa, inflamación) NO se ajustan porque el riesgo es el mismo a cualquier edad.
          </p>
          <p className="font-medium text-foreground">
            Envejecer es inevitable. Envejecer mal es opcional.
          </p>
          <p>
            Los rangos ajustados por edad son realistas, no bajas expectativas. Si estás en zona verde a los 55+, estás en el top 10% de tu grupo etario.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function IndicatorRow({
  label, value, unit, status, range, trendInfo,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  status?: Status;
  range?: RangeSpec | null;
  trendInfo?: TrendInfo;
}) {
  return (
    <div className="rounded border px-2.5 py-1.5 space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        {status && <StatusDot s={status} />}
      </div>
      <p className="text-sm font-semibold">
        {value ?? "—"}
        {value != null && unit && <span className="text-[10px] font-normal text-muted-foreground ml-1">{unit}</span>}
      </p>
      {trendInfo && trendInfo.dir !== "none" && <TrendArrow t={trendInfo} />}
      {range && (
        <details>
          <summary className="cursor-pointer text-[10px] text-muted-foreground select-none">Rangos</summary>
          <div className="mt-1"><RangeBox r={range} label={label} /></div>
        </details>
      )}
    </div>
  );
}

function CellWithStatus({ value, status }: { value: string | number | null | undefined; status?: Status }) {
  if (value == null) return <div className="text-muted-foreground">—</div>;
  return (
    <div className="flex items-center gap-1">
      {status && status !== "unknown" && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLES[status].dot}`} />}
      <span>{value}</span>
    </div>
  );
}
