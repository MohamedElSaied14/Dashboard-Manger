import { create } from "zustand";
import type { Role } from "../lib/types";

interface User {
  id: string;
  email: string;
  name: string;
  nameAr?: string;
  role: Role;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  lang: "en" | "ar";
  /**
   * True once the session has been restored on the client. Screens wait for this
   * so a signed-in user is never bounced to /login during startup.
   */
  hasHydrated: boolean;
  restore: () => { user: User | null; hasValidToken: boolean };
  setHydrated: () => void;
  setAuth: (user: User | null, token: string | null) => void;
  setLang: (lang: "en" | "ar") => void;
  logout: () => void;
}

const TOKEN_KEY = "accessToken";
const USER_KEY = "user";

/** Reads a JWT's `exp` claim without verifying it — used only to skip tokens we know are stale. */
function secondsUntilExpiry(token: string): number {
  try {
    const [, payload] = token.split(".");
    const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof exp === "number" ? exp - Math.floor(Date.now() / 1000) : 0;
  } catch {
    return 0;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  // Server and first client render must agree, so storage is only read in `restore`.
  user: null,
  accessToken: null,
  lang: "en",
  hasHydrated: false,

  /**
   * Rehydrates from storage. The access token lives in sessionStorage (per-tab,
   * cleared when the tab closes) so a page reload doesn't need a round-trip to
   * /auth/refresh; the long-lived refresh token stays in an httpOnly cookie.
   */
  restore: () => {
    if (typeof window === "undefined") return { user: null, hasValidToken: false };

    const lang = (localStorage.getItem("lang") as "en" | "ar") || "en";
    let user: User | null = null;
    try {
      const raw = localStorage.getItem(USER_KEY);
      user = raw ? (JSON.parse(raw) as User) : null;
    } catch {
      localStorage.removeItem(USER_KEY);
    }

    const stored = sessionStorage.getItem(TOKEN_KEY);
    // Require a minute of headroom so a token can't expire mid-flight.
    const token = stored && secondsUntilExpiry(stored) > 60 ? stored : null;
    if (stored && !token) sessionStorage.removeItem(TOKEN_KEY);

    set({ user, lang, accessToken: token });
    return { user, hasValidToken: !!token };
  },

  setHydrated: () => set({ hasHydrated: true }),

  setAuth: (user, token) => {
    if (typeof window !== "undefined") {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    }
    set({ user, accessToken: token });
  },

  setLang: (lang) => {
    if (typeof window !== "undefined") localStorage.setItem("lang", lang);
    set({ lang });
  },

  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    }
    set({ user: null, accessToken: null });
  },
}));
