"use client";

import { forwardRef, useId } from "react";
import { cn } from "../../lib/cn";

const control =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint transition-[border-color,box-shadow] duration-150 hover:border-border-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:bg-surface-sunken disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(control, "h-10", className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-[96px] resize-y", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(control, "h-10 pr-8", className)} {...props} />;
  },
);

/**
 * Wraps a control with its label, optional hint and error message, and wires up
 * the id/aria plumbing so every form in the app is accessible by default.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-xs font-semibold text-muted">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": !!error || undefined })}
      {error ? (
        <p id={`${id}-error`} className="text-2xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-2xs text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
