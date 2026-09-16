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
