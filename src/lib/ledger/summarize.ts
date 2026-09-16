import type { DayGroup, MonthSummary, Transaction } from "./types";

/** Snap a sum of two-decimal amounts back to two decimals. */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function summarize(transactions: readonly Transaction[]): MonthSummary {
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    if (t.kind === "income") income += t.amount;
    else expenses += t.amount;
  }
  income = cents(income);
  expenses = cents(expenses);
  return { income, expenses, net: cents(income - expenses), count: transactions.length };
}

/**
 * Entries grouped by day, newest day first. The order WITHIN a day is the
 * order given — the caller decides that (the API returns newest-created
 * first), this only buckets.
 */
export function groupByDay(transactions: readonly Transaction[]): DayGroup[] {
  const byDate = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = byDate.get(t.occurred_on);
    if (list) list.push(t);
    else byDate.set(t.occurred_on, [t]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, items]) => ({ date, items, net: summarize(items).net }));
}
