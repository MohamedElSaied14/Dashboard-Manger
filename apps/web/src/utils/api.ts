import { useAuthStore } from "../store/authStore";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000/api";

let refreshRequest: Promise<"ok" | "expired" | "unavailable"> | null = null;

/**
 * Exchanges the httpOnly refresh cookie for a fresh access token.
 *
 * The three outcomes are deliberately distinct: only "expired" means the user is
 * really signed out. A rate-limited or unreachable API returns "unavailable" so
 * a transient blip can't wipe a valid session.
 */
export async function renewSession(): Promise<"ok" | "expired" | "unavailable"> {
  if (typeof window === "undefined") return "unavailable";

  if (!refreshRequest) {
    refreshRequest = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    })
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          useAuthStore.getState().setAuth(data.user, data.accessToken);
          return "ok" as const;
        }
        // 401/403 mean the refresh token itself is no longer valid.
        return response.status === 401 || response.status === 403
          ? ("expired" as const)
          : ("unavailable" as const);
      })
      .catch(() => "unavailable" as const)
      .finally(() => {
        refreshRequest = null;
      });
  }

  return refreshRequest;
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {},
  allowRefresh = true,
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(options.headers);

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && allowRefresh && path !== "/auth/refresh") {
    const outcome = await renewSession();
    if (outcome === "ok") return apiRequest<T>(path, options, false);
    // Only a genuinely expired session ends it; anything else surfaces as a
    // normal request error and the user keeps their session.
    if (outcome === "expired") useAuthStore.getState().logout();
  }

  if (!response.ok) {
    let errorMessage = "An error occurred";
    try {
      const errorData = await response.json();
      errorMessage = Array.isArray(errorData.message)
        ? errorData.message.join(", ")
        : errorData.message || errorMessage;
    } catch {
      // Non-JSON error bodies fall back to the generic message.
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) return {} as T;

  return response.json();
}
