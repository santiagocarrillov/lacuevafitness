"use client";

interface GaugeProps {
  pct: number;
  label: string;
  total: number;
  evaluated: number;
}

function gaugeColor(pct: number): string {
  if (pct >= 90) return "#22c55e";
  if (pct >= 60) return "#f59e0b";
  return "#ef4444";
}

export function ComplianceGauge({ pct, label, total, evaluated }: GaugeProps) {
  const clamped = Math.min(100, Math.max(0, pct));
  const color = gaugeColor(clamped);
  const gap = 100 - clamped;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 200 118" className="w-44" aria-label={`${label}: ${clamped}%`}>
        {/* Background track */}
        <path
          d="M 20 100 A 80 80 0 0 0 180 100"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="16"
          strokeLinecap="round"
          pathLength="100"
        />
        {/* Value fill */}
        <path
          d="M 20 100 A 80 80 0 0 0 180 100"
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${clamped} ${gap}`}
          pathLength="100"
        />
        {/* Zone markers */}
        <text x="12" y="115" textAnchor="middle" fontSize="9" fill="#9ca3af">0%</text>
        <text x="100" y="18" textAnchor="middle" fontSize="9" fill="#9ca3af">50%</text>
        <text x="188" y="115" textAnchor="middle" fontSize="9" fill="#9ca3af">100%</text>
        {/* Percentage */}
        <text x="100" y="82" textAnchor="middle" fontSize="28" fontWeight="700" fill={color}>
          {Math.round(clamped)}%
        </text>
        {/* Sublabel */}
        <text x="100" y="98" textAnchor="middle" fontSize="10" fill="#6b7280">
          evaluados
        </text>
      </svg>
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs text-muted-foreground">
        {evaluated} / {total} socios
      </p>
    </div>
  );
}
