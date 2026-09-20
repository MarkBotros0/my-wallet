import { TRANSACTION_KINDS, type ClientInput, type TransactionInput, type TransactionKind } from "./types";
import { isIsoDate } from "./months";

/**
 * The one place an entry's rules are spelled. Both the API route and the
 * form call this, so a value the form lets through is a value the route
 * accepts, and vice versa.
 */

export const MAX_AMOUNT = 1e12;
export const MAX_CLIENT_NAME_LENGTH = 60;
export const MAX_CLIENT_NOTE_LENGTH = 500;
export const MAX_ID_LENGTH = 64;
export const MIN_YEAR = 1970;
export const MAX_YEAR = 2100;

export type ValidationResult =
  | { ok: true; value: TransactionInput }
  | { ok: false; errors: string[] };

/** `amount` has at most two decimals — allowing for IEEE noise like 0.30000000000000004. */
function hasAtMostTwoDecimals(amount: number): boolean {
  return Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
}

/** Snap to cents so 0.1 + 0.2 is stored as 0.3, not 0.30000000000000004. */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
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

  // Absent means none: rows written before the column existed carry 0, and a
  // client that does not know about the share sends nothing.
  const godsShare = src.gods_share === undefined ? 0 : src.gods_share;
  if (typeof godsShare !== "number" || !Number.isFinite(godsShare) || godsShare < 0) {
    errors.push("God's share must be a number of zero or more.");
  } else if (!hasAtMostTwoDecimals(godsShare)) {
    errors.push("God's share can have at most two decimal places.");
  } else if (typeof amount === "number" && godsShare > amount + 1e-6) {
    errors.push("God's share cannot exceed the amount.");
  }

  // Null, undefined and "" all mean unlinked — the form's select sends "" for
  // its "none" option.
  let clientId: string | null = null;
  if (src.client_id !== undefined && src.client_id !== null && src.client_id !== "") {
    if (typeof src.client_id !== "string" || src.client_id.trim().length > MAX_ID_LENGTH) {
      errors.push("Client is not valid.");
    } else if (kind === "expense") {
      errors.push("Only income can be linked to a client.");
    } else {
      clientId = src.client_id.trim();
    }
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

  // Anything else on the object — the category and note of entries before
  // 2026-09-21, or whatever a stale client sends — is dropped, not stored.
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      kind: kind as TransactionKind,
      amount: cents(amount as number),
      occurred_on: occurredOn as string,
      client_id: clientId,
      gods_share: cents(godsShare as number),
    },
  };
}

export type ClientValidationResult =
  | { ok: true; value: ClientInput }
  | { ok: false; errors: string[] };

export function validateClientInput(raw: unknown): ClientValidationResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["Client must be an object."] };
  }
  const src = raw as Record<string, unknown>;
  const errors: string[] = [];

  const name = typeof src.name === "string" ? src.name.trim() : "";
  if (name.length === 0) {
    errors.push("Name is required.");
  } else if (name.length > MAX_CLIENT_NAME_LENGTH) {
    errors.push(`Name must be at most ${MAX_CLIENT_NAME_LENGTH} characters.`);
  }

  const note = typeof src.note === "string" ? src.note.trim() : "";
  if (note.length > MAX_CLIENT_NOTE_LENGTH) {
    errors.push(`Note must be at most ${MAX_CLIENT_NOTE_LENGTH} characters.`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { name, note } };
}
