import { getStoredToken, notifyUnauthorized } from "../components/AuthProvider";
import type {
  CategorySuggestions,
  Client,
  ClientInput,
  ClientOption,
  ClientSummary,
  GodsShareTotals,
  Transaction,
  TransactionInput,
} from "@/lib/ledger";

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

// ---- Transactions ledger ----

export interface MonthResponse {
  month: string;
  transactions: Transaction[];
  categories: CategorySuggestions;
  clients: ClientOption[];
}

export async function fetchMonth(month: string): Promise<MonthResponse> {
  return fetchJSON<MonthResponse>(`${BASE}/transactions?month=${encodeURIComponent(month)}`);
}

export async function createTransaction(input: TransactionInput): Promise<{ transaction: Transaction }> {
  return fetchJSON(`${BASE}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateTransaction(
  id: string,
  input: TransactionInput,
): Promise<{ transaction: Transaction }> {
  return fetchJSON(`${BASE}/transactions/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteTransaction(id: string): Promise<{ deleted: string }> {
  return fetchJSON(`${BASE}/transactions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ---- Clients ----

export interface ClientsResponse {
  year: string;
  clients: ClientSummary[];
}

export interface ClientYearResponse {
  client: Client;
  year: string;
  transactions: Transaction[];
  /** What the entry form needs, so the client page can add income in place. */
  categories: CategorySuggestions;
  clients: ClientOption[];
}

export async function fetchClients(year: string): Promise<ClientsResponse> {
  return fetchJSON<ClientsResponse>(`${BASE}/clients?year=${encodeURIComponent(year)}`);
}

export async function fetchClientYear(id: string, year: string): Promise<ClientYearResponse> {
  return fetchJSON<ClientYearResponse>(
    `${BASE}/clients/${encodeURIComponent(id)}?year=${encodeURIComponent(year)}`,
  );
}

export async function createClient(input: ClientInput): Promise<{ client: Client }> {
  return fetchJSON(`${BASE}/clients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateClient(id: string, input: ClientInput): Promise<{ client: Client }> {
  return fetchJSON(`${BASE}/clients/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteClient(id: string): Promise<{ deleted: string }> {
  return fetchJSON(`${BASE}/clients/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ---- God's share ----

export interface GodsShareResponse {
  totals: GodsShareTotals;
  settlements: Transaction[];
}

export async function fetchGodsShare(): Promise<GodsShareResponse> {
  return fetchJSON<GodsShareResponse>(`${BASE}/gods-share`);
}
