import { STATUS_COLOR, STATUS_LABEL, type EvalStatus } from "@/lib/srxfit/eval-score";

export function StatusBadge({ status }: { status: EvalStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color}18`, color }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {STATUS_LABEL[status]}
    </span>
  );
}
