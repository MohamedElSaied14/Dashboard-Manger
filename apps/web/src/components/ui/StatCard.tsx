import type { LucideIcon } from "lucide-react";
import { Badge, type BadgeTone } from "./Badge";
import { Card } from "./Card";
import { Skeleton } from "./State";

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
  loading,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: BadgeTone;
  icon: LucideIcon;
  loading?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-faint" aria-hidden />
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-16" />
      ) : (
        <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
      )}
      {hint && (
        <Badge tone={tone} className="mt-3">
          {hint}
        </Badge>
      )}
    </Card>
  );
}
