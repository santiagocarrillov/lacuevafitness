import { Badge } from "@/components/ui/badge";
import { frequencyBucket, FREQUENCY_META } from "@/lib/frequency";

// Small presentational badge for a member's attendance frequency, driven by
// visits in the last 30 days. Safe to use in both server and client components.
export function FrequencyBadge({
  visitsLast30,
  showCount = false,
  className = "",
}: {
  visitsLast30: number;
  showCount?: boolean;
  className?: string;
}) {
  const meta = FREQUENCY_META[frequencyBucket(visitsLast30)];
  return (
    <Badge
      variant="outline"
      className={`text-xs ${meta.cls} ${className}`}
      title={`${visitsLast30} visita${visitsLast30 === 1 ? "" : "s"} en los últimos 30 días`}
    >
      {meta.label}
      {showCount && ` · ${visitsLast30}`}
    </Badge>
  );
}
