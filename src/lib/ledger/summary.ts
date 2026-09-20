import type { ClientSummary, MonthClientIncome, YearIncome } from "./types";

/**
 * Home's two charts, derived from one grouped series (see MonthClientIncome)
 * so they cannot disagree with each other or with the year's headline.
 */

/** "all" clients, "none" for income with no client, or one client's id. */
export type ClientFilter = "all" | "none" | string;

/** Snap a sum of two-decimal amounts back to two decimals. */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Income per month of `year`, January first (12 entries), for the filter. */
export function monthlyIncome(series: readonly MonthClientIncome[], year: string, filter: ClientFilter): number[] {
  const out = new Array<number>(12).fill(0);
  for (const r of series) {
    if (r.month.slice(0, 4) !== year) continue;
    const matches = filter === "all" || (filter === "none" ? r.client_id === null : r.client_id === filter);
    if (!matches) continue;
    out[Number(r.month.slice(5, 7)) - 1] += r.income;
  }
  return out.map(cents);
}

export interface ClientBar {
  /** null is the "No client" bar. */
  id: string | null;
  name: string;
  total: number;
  count: number;
}

/**
 * One bar per client that paid this year, biggest first, plus a "No client"
 * bar for whatever the year's total is not accounted for by a client — so
 * the bars add up to the headline. Clients with nothing this year are left
 * out: a zero-length bar is noise, and the Clients page still lists them.
 */
export function clientBars(clients: readonly ClientSummary[], yearIncome: YearIncome): ClientBar[] {
  const bars: ClientBar[] = clients
    .filter((c) => c.year_total > 0)
    .map((c) => ({ id: c.id, name: c.name, total: c.year_total, count: c.year_count }));
  const linked = clients.reduce((sum, c) => sum + c.year_total, 0);
  const linkedCount = clients.reduce((sum, c) => sum + c.year_count, 0);
  const unlinked = cents(yearIncome.income - linked);
  if (unlinked > 0) {
    bars.push({ id: null, name: "No client", total: unlinked, count: Math.max(0, yearIncome.count - linkedCount) });
  }
  return bars.sort((a, b) => b.total - a.total);
}
