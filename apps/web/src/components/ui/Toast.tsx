"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { NotificationKind } from "../../utils/notify";
import { cn } from "../../lib/cn";

type Toast = { id: string; message: string; kind: NotificationKind };

const ToastContext = createContext<(message: string, kind?: NotificationKind) => void>(() => {});

/** Imperative toast API for components: `const toast = useToast()`. */
export const useToast = () => useContext(ToastContext);

const TONE = {
  success: { icon: CheckCircle2, cls: "border-success/40 bg-success-soft text-success-ink" },
  error: { icon: AlertTriangle, cls: "border-danger/40 bg-danger-soft text-danger-ink" },
  info: { icon: Info, cls: "border-brand/40 bg-brand-soft text-brand-ink" },
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, kind: NotificationKind = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current.slice(-3), { id, message, kind }]);
      window.setTimeout(() => dismiss(id), 3600);
    },
    [dismiss],
  );

  // Bridge for non-React callers that dispatch the `accountflow:notify` event.
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; kind: NotificationKind }>).detail;
      if (detail?.message) push(detail.message, detail.kind);
    };
    window.addEventListener("accountflow:notify", listener);
    return () => window.removeEventListener("accountflow:notify", listener);
  }, [push]);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 end-4 z-[100] grid w-[min(360px,calc(100vw-2rem))] gap-2"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const { icon: Icon, cls } = TONE[toast.kind] ?? TONE.info;
          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto flex animate-slide-up items-start gap-2.5 rounded-lg border p-3 text-xs font-medium shadow-md",
                cls,
              )}
            >
              <Icon className="mt-px h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1 leading-relaxed">{toast.message}</span>
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
