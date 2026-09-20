/**
 * The transactions ledger — shared vocabulary.
 *
 * Pure TypeScript, no React/Next/DB: the same types describe a DB row on the
 * server and an entry on the screen, and the helpers beside them are tested
 * without either.
 */

export type TransactionKind = "expense" | "income";

export const TRANSACTION_KINDS: readonly TransactionKind[] = ["expense", "income"];

/** What the client sends to create or replace an entry. */
export interface TransactionInput {
  kind: TransactionKind;
  /** Positive, at most two decimals, in the user's currency. */
  amount: number;
  /** 'YYYY-MM-DD'. */
  occurred_on: string;
  category: string;
  note: string;
  /** The client this income was collected from; null for unlinked entries and for every expense. */
  client_id: string | null;
  /**
   * How much of this entry is God's share money, 0 ≤ x ≤ amount. On an
   * income it is the amount set aside (accrued); on an expense it is the
   * amount paid out of the share (settled). One column, one meaning.
   */
  gods_share: number;
}

/** A stored entry. `user_id` is deliberately absent: every read is already scoped. */
export interface Transaction extends TransactionInput {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface MonthSummary {
  income: number;
  expenses: number;
  net: number;
  count: number;
}

export interface DayGroup {
  /** 'YYYY-MM-DD' */
  date: string;
  items: Transaction[];
  /** Income minus expenses for that day. */
  net: number;
}

/** Distinct categories the user has used, per kind — for autocomplete. */
export type CategorySuggestions = Record<TransactionKind, string[]>;

// ---- Clients ----

/** What the client sends to create or rename a client. */
export interface ClientInput {
  name: string;
  note: string;
}

/** A stored client. `user_id` is deliberately absent: every read is already scoped. */
export interface Client extends ClientInput {
  id: string;
  created_at: string;
  updated_at: string;
}

/** Just enough of a client for the form's select. */
export interface ClientOption {
  id: string;
  name: string;
}

/** A client with what it paid in one calendar year. */
export interface ClientSummary extends Client {
  year_total: number;
  year_share: number;
  year_count: number;
}

/**
 * Every income entry in one calendar year — linked to a client or not — so
 * the Clients page can head its cards with the year's total. The same three
 * numbers as a ClientSummary, over the whole ledger.
 */
export interface YearIncome {
  /** Σ amount over income entries. */
  income: number;
  /** Σ gods_share over income entries. */
  share: number;
  count: number;
}

// ---- God's share ----

export interface GodsShareTotals {
  /** Σ gods_share over income entries. */
  accrued: number;
  /** Σ gods_share over expense entries. */
  settled: number;
  /** accrued − settled. */
  remaining: number;
}
