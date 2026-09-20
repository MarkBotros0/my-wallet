/**
 * The persisted half of auth: token + user in localStorage, a presence cookie
 * for src/proxy.ts, and a tiny external store so React reads it through
 * `useSyncExternalStore` — the server snapshot is always "signed out", the
 * client snapshot is whatever localStorage holds, and React reconciles the
 * two without a hydration mismatch or a setState-in-effect.
 *
 * Everything that WRITES auth state goes through `storeAuth` / `clearStoredAuth`
 * so the cookie, localStorage and the in-memory snapshot cannot disagree.
 */

const TOKEN_KEY = "wallet.auth.token";
const USER_KEY = "wallet.auth.user";
// Read by src/proxy.ts to redirect signed-out visitors. Keep the two spellings
// identical.
const PRESENCE_COOKIE = "wallet.auth.present";
// Thirty days, matching TOKEN_LIFETIME_DAYS on the server.
const PRESENCE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface AuthUser {
  id: string;
  username: string;
}

export interface StoredAuth {
  token: string | null;
  user: AuthUser | null;
}

const EMPTY: StoredAuth = { token: null, user: null };

let snapshot: StoredAuth | null = null;
const listeners = new Set<() => void>();

function readFromStorage(): StoredAuth {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return EMPTY;
    const raw = localStorage.getItem(USER_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    // Cached from a previous session and only ever used optimistically —
    // /auth/me re-reads the row on every load.
    const user: AuthUser | null =
      parsed && typeof parsed.id === "string" && typeof parsed.username === "string"
        ? { id: parsed.id, username: parsed.username }
        : null;
    return { token, user };
  } catch {
    return EMPTY;
  }
}

export function getSnapshot(): StoredAuth {
  if (snapshot === null) snapshot = readFromStorage();
  return snapshot;
}

export function getServerSnapshot(): StoredAuth {
  return EMPTY;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

export function setPresenceCookie(present: boolean) {
  if (typeof document === "undefined") return;
  if (present) {
    document.cookie = `${PRESENCE_COOKIE}=1; path=/; max-age=${PRESENCE_MAX_AGE_SECONDS}; samesite=lax`;
  } else {
    document.cookie = `${PRESENCE_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
}

/** The raw token, for attaching to requests. Read straight from storage. */
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Wipe the service worker's Cache Storage.
 *
 * sw.js is network-first for /api/* and navigations, but it FALLS BACK to the
 * cache when a request fails. Without this, a signed-out person on a shared
 * phone could go offline (or catch a network blip) and the worker would
 * happily re-serve the last pages and API responses it saw. Clearing the token
 * alone would make "signed out" a claim rather than a fact.
 *
 * Fire-and-forget: the Cache API is unavailable on insecure origins and in
 * private windows, and a failure here must never block the sign-out itself.
 */
function clearCachedResponses() {
  if (typeof caches === "undefined") return;
  caches
    .keys()
    .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    .catch(() => {});
}

export function storeAuth(token: string, user: AuthUser) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {}
  setPresenceCookie(true);
  snapshot = { token, user };
  emit();
}

export function clearStoredAuth() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {}
  setPresenceCookie(false);
  clearCachedResponses();
  snapshot = EMPTY;
  emit();
}
