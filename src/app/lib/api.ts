import { getStoredToken, notifyUnauthorized } from "../components/AuthProvider";

/**
 * Typed fetch wrappers. Every call goes through `fetchJSON`, which attaches
 * the Bearer token and turns a 401 into a sign-out — so a route handler that
 * rejects the token logs the user out wherever they happen to be.
 */

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export async function fetchJSON<T>(
  url: string,
  options?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options?.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // A request with no ceiling never settles. AbortController rather than
  // AbortSignal.timeout, because this ships as a PWA to phones and the latter
  // is not universally available on older mobile Safari.
  const { timeoutMs, ...init } = options ?? {};
  const controller = timeoutMs ? new AbortController() : null;
  const timer =
    controller && timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller?.signal ?? init.signal,
    });
    if (res.status === 401) {
      notifyUnauthorized();
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || data.error || `Request failed: ${res.status}`);
    }
    return data as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---- User administration (admin only) ----

export interface ManagedUser {
  id: string;
  username: string;
  role: "user" | "admin";
  is_active: boolean;
  created_at: string;
}

/**
 * `generated_password` is populated ONLY when the backend generated one, and
 * only on the response to the call that created it. It is never readable again.
 */
export interface PasswordResult {
  generated_password: string | null;
}

export async function fetchUsers(): Promise<{ users: ManagedUser[] }> {
  return fetchJSON<{ users: ManagedUser[] }>(`${BASE}/users`);
}

export async function createUser(
  username: string,
  password?: string,
): Promise<{ user: ManagedUser } & PasswordResult> {
  return fetchJSON(`${BASE}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: password || null }),
  });
}

export async function resetUserPassword(
  id: string,
  password?: string,
): Promise<{ id: string; username: string } & PasswordResult> {
  return fetchJSON(`${BASE}/users/${encodeURIComponent(id)}/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: password || null }),
  });
}

export async function setUserActive(id: string, isActive: boolean): Promise<ManagedUser> {
  return fetchJSON<ManagedUser>(`${BASE}/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: isActive }),
  });
}

export async function deleteUser(id: string): Promise<{ deleted: string; username: string }> {
  return fetchJSON(`${BASE}/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
