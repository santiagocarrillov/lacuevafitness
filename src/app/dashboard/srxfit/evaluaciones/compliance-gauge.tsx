import { STATUS_COLOR } from "@/lib/srxfit/eval-score";

interface GaugeProps {
  pct: number;
  label: string;
  total: number;
  evaluated: number;
}

function gaugeColor(pct: number): string {
  if (pct >= 90) return STATUS_COLOR.evaluado;
  if (pct >= 60) return STATUS_COLOR.parcial;
  return STATUS_COLOR.pendiente;
}

// Upper half-circle, left (0 %) to right (100 %). sweep-flag 1 = clockwise on
// screen, i.e. over the top; 0 drew it under the baseline, outside the box.
const ARC = "M 20 100 A 80 80 0 0 1 180 100";

export function ComplianceGauge({ pct, label, total, evaluated }: GaugeProps) {
  const clamped = Math.min(100, Math.max(0, pct));
  const color = gaugeColor(clamped);

  return (
    <div className="flex w-48 flex-col items-center rounded-xl border border-stone-200 bg-white px-3 pb-3 pt-4">
      <svg viewBox="0 0 200 112" className="w-40" aria-label={`${label}: ${clamped}%`}>
        <path d={ARC} fill="none" stroke="#ece8e1" strokeWidth="14" strokeLinecap="round" pathLength={100} />
        {clamped > 0 && (
          <path
            d={ARC}
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${clamped} 100`}
          />
        )}
        <text x="100" y="86" textAnchor="middle" fontSize="30" fontWeight="700" fill={color}>
          {Math.round(clamped)}%
        </text>
        <text x="20" y="111" textAnchor="middle" fontSize="9" fill="#a8a29e">0</text>
        <text x="180" y="111" textAnchor="middle" fontSize="9" fill="#a8a29e">100</text>
      </svg>
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs text-muted-foreground">
        {evaluated} de {total} evaluados
      </p>
    </div>
  );
}
