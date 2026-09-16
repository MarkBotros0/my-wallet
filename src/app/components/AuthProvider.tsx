"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import {
  asRole,
  clearStoredAuth,
  getServerSnapshot,
  getSnapshot,
  getStoredToken,
  setPresenceCookie,
  storeAuth,
  subscribe,
  type AuthUser,
  type UserRole,
} from "../lib/authStore";

export type { AuthUser, UserRole };
export { clearStoredAuth, getStoredToken };

const UNAUTHORIZED_EVENT = "wallet:unauthorized";

// Same-origin route handlers. The env var exists only so the API could be
// split out later without touching every call site.
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

interface AuthCtx {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

/**
 * Called by lib/api.ts when any request comes back 401. Clears the stored
 * session (the store notifies every subscriber, so the nav disappears at once)
 * and asks the provider to send the user to the login form.
 */
export function notifyUnauthorized() {
  if (typeof window === "undefined") return;
  clearStoredAuth();
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Server snapshot is always signed-out; the client snapshot is localStorage.
  // React swaps one for the other during hydration without a mismatch.
  const { token, user } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Has this page load checked the stored token against /auth/me yet? Until
  // it has, a stored session is used optimistically and reported as loading.
  const [validated, setValidated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStoredToken();
    if (!stored) {
      // Nothing to validate. Make sure the UX cookie agrees, so the proxy does
      // not keep letting a signed-out browser onto protected pages.
      setPresenceCookie(false);
      return;
    }

    // Validate the token with the backend. A rotated AUTH_SECRET makes every
    // existing signature invalid, so this call fails with 401 and logs the
    // user out on the first page load after a secret rotation. A role change
    // lands here too — /auth/me reads the role from the DB row.
    let cancelled = false;
    fetch(`${BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          clearStoredAuth();
          return;
        }
        const data = await res.json();
        if (res.ok && data?.id && data?.username) {
          storeAuth(stored, {
            id: data.id,
            username: data.username,
            role: asRole(data.role),
          });
        }
      })
      .catch(() => {
        // Network error — keep the optimistic state; a real 401 will be
        // surfaced when the user performs a protected action.
      })
      .finally(() => {
        if (!cancelled) setValidated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      // Every page is protected, so a rejected token means the current page
      // is dead wherever the user happens to be — send them to the login form
      // rather than leaving them on a shell that 401s on every fetch.
      const path = window.location.pathname;
      if (path !== "/login") {
        router.replace(`/login?next=${encodeURIComponent(path)}`);
      }
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router]);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.detail || data?.error || "Invalid username or password";
      setError(msg);
      throw new Error(msg);
    }
    storeAuth(data.access_token, {
      id: data.user?.id,
      username: data.user?.username,
      role: asRole(data.user?.role),
    });
    // The login response is authoritative — nothing left to validate.
    setValidated(true);
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setError(null);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      token,
      isAuthenticated: !!user && !!token,
      isAdmin: user?.role === "admin",
      // Signed out there is nothing to load; signed in, we are loading until
      // /auth/me has answered once this page load.
      isLoading: !!token && !validated,
      error,
      login,
      logout,
    }),
    [user, token, validated, error, login, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      user: null,
      token: null,
      isAuthenticated: false,
      isAdmin: false,
      isLoading: false,
      error: null,
      login: async () => {},
      logout: () => {},
    };
  }
  return ctx;
}
