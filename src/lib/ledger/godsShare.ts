import type { GodsShareTotals, Transaction } from "./types";

/**
 * God's share — the tithe set aside from income and paid out over time.
 *
 * `gods_share` on a row means the same thing on both kinds: how much of that
 * entry is God's share money. Income accrues it, expenses settle it, and the
 * balance owed is the difference. These helpers are the client-side twin of
 * the two SUMs the server runs; the page derives from a list and the two
 * cannot disagree.
 */

/** A fraction, like every rate in this app: 10% is 0.1. */
export const DEFAULT_GODS_SHARE_RATE = 0.1;

/** Snap to two decimals. */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The share an income entry gets before the user touches the field. */
export function defaultGodsShare(amount: number): number {
  return cents(amount * DEFAULT_GODS_SHARE_RATE);
}

export function godsShareTotals(transactions: readonly Transaction[]): GodsShareTotals {
  let accrued = 0;
  let settled = 0;
  for (const t of transactions) {
    if (t.kind === "income") accrued += t.gods_share;
    else settled += t.gods_share;
  }
  accrued = cents(accrued);
  settled = cents(settled);
  return { accrued, settled, remaining: cents(accrued - settled) };
}
