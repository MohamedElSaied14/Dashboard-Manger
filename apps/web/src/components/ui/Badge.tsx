import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const badge = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide",
  {
    variants: {
      tone: {
        neutral: "bg-surface-sunken text-muted",
        brand: "bg-brand-soft text-brand-ink",
        success: "bg-success-soft text-success-ink",
        warning: "bg-warning-soft text-warning-ink",
        danger: "bg-danger-soft text-danger-ink",
        accent: "bg-accent-soft text-accent-ink",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badge>["tone"]>;

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

/** Maps the domain vocabularies onto badge tones in one place. */
export const statusTone: Record<string, BadgeTone> = {
  active: "success",
  completed: "success",
  approved: "success",
  onboarding: "brand",
  lead: "brand",
  holding: "warning",
  changes_requested: "warning",
  analyzing: "warning",
  not_active: "danger",
  rejected: "danger",
  archived: "neutral",
  uploaded: "neutral",
};

export const priorityTone: Record<string, BadgeTone> = {
  high: "danger",
  medium: "warning",
  low: "brand",
};
