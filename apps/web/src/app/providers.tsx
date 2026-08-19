"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ThemeProvider } from "../components/ThemeProvider";
import { ToastProvider } from "../components/ui/Toast";
import { useAuthStore } from "../store/authStore";
import { renewSession } from "../utils/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Long enough that moving between sections reads from cache instead
            // of refetching, short enough to pick up real changes.
            staleTime: 60_000,
            gcTime: 10 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    let cancelled = false;

    // Restore the session before any screen renders. Renewing here — rather than
    // letting the first query 401 and retry — removes a request waterfall from
    // page loads, and the cached access token means most loads skip the network
    // entirely.
    (async () => {
      const { user, hasValidToken } = useAuthStore.getState().restore();
      if (user && !hasValidToken) {
        const outcome = await renewSession();
        if (outcome === "expired") useAuthStore.getState().logout();
      }
      if (!cancelled) useAuthStore.getState().setHydrated();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
