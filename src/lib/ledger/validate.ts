import { TRANSACTION_KINDS, type TransactionInput, type TransactionKind } from "./types";
import { isIsoDate } from "./months";

/**
 * The one place an entry's rules are spelled. Both the API route and the
 * form call this, so a value the form lets through is a value the route
 * accepts, and vice versa.
 */

export const MAX_AMOUNT = 1e12;
export const MAX_CATEGORY_LENGTH = 40;
export const MAX_NOTE_LENGTH = 500;
export const MIN_YEAR = 1970;
export const MAX_YEAR = 2100;

export type ValidationResult =
  | { ok: true; value: TransactionInput }
  | { ok: false; errors: string[] };

/** `amount` has at most two decimals — allowing for IEEE noise like 0.30000000000000004. */
function hasAtMostTwoDecimals(amount: number): boolean {
  return Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
}

export function validateTransactionInput(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["Transaction must be an object."] };
  }
  const src = raw as Record<string, unknown>;
  const errors: string[] = [];

  const kind = src.kind;
  if (!TRANSACTION_KINDS.includes(kind as TransactionKind)) {
    errors.push("Kind must be 'expense' or 'income'.");
  }

  const amount = src.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    errors.push("Amount must be a number greater than zero.");
  } else if (amount > MAX_AMOUNT) {
    errors.push("Amount is unrealistically large.");
  } else if (!hasAtMostTwoDecimals(amount)) {
    errors.push("Amount can have at most two decimal places.");
  }

  const occurredOn = src.occurred_on;
  if (typeof occurredOn !== "string" || !isIsoDate(occurredOn)) {
    errors.push("Date must be a real date in YYYY-MM-DD form.");
  } else {
    const year = Number(occurredOn.slice(0, 4));
    if (year < MIN_YEAR || year > MAX_YEAR) {
      errors.push(`Date must be between ${MIN_YEAR} and ${MAX_YEAR}.`);
    }
  }

  const category = typeof src.category === "string" ? src.category.trim() : "";
  if (category.length > MAX_CATEGORY_LENGTH) {
    errors.push(`Category must be at most ${MAX_CATEGORY_LENGTH} characters.`);
  }

  const note = typeof src.note === "string" ? src.note.trim() : "";
  if (note.length > MAX_NOTE_LENGTH) {
    errors.push(`Note must be at most ${MAX_NOTE_LENGTH} characters.`);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      kind: kind as TransactionKind,
      // Snap to cents so 0.1 + 0.2 is stored as 0.3, not 0.30000000000000004.
      amount: Math.round((amount as number) * 100) / 100,
      occurred_on: occurredOn as string,
      category,
      note,
    },
  };
}
