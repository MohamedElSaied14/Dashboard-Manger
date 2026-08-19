import { cn } from "../../lib/cn";
import { Card } from "./Card";

/** Grey block that stands in for content while a query is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

/** Card-shaped skeleton used by list and grid pages. */
export function SkeletonCards({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-5 h-1.5 w-full" />
          <div className="mt-4 flex justify-between">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="grid place-items-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand-ink">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="border-danger/30 bg-danger-soft/40 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-danger-ink">Something went wrong</p>
      <p className="mt-1 text-xs text-muted">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 text-xs font-semibold text-brand underline underline-offset-2"
        >
          Try again
        </button>
      )}
    </Card>
  );
}
