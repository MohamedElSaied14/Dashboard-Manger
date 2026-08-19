"use client";

import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

/** Accessible completion toggle shared by the dashboard and the tasks list. */
export function TaskCheckbox({
  checked,
  label,
  onChange,
  className,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-colors duration-150",
        checked
          ? "border-brand bg-brand text-white"
          : "border-border-strong text-transparent hover:border-brand",
        className,
      )}
    >
      <Check className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}
