/**
 * Number formatting, spelled once. Amounts are whole units with thousands
 * separators and the currency code after — "8,860,000 EGP" — the way the EGX
 * app writes prices.
 */

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount);
  // Intl formats -0 as "-0"; nobody owes minus nothing.
  const text = whole.format(rounded === 0 ? 0 : rounded);
  return currency ? `${text} ${currency}` : text;
}

/** Signed variant for deltas: "+120,000 EGP" / "−80,000 EGP". */
export function formatSignedMoney(amount: number, currency: string): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${formatMoney(Math.abs(amount), currency)}`;
}

const exact = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * Ledger amounts keep their piastres: 2,450.75 stays "2,450.75", while a
 * whole 1,300 stays "1,300" rather than "1,300.00". (`formatMoney` rounds to
 * whole units, which is right for the calculator's millions and wrong here.)
 */
export function formatAmount(amount: number, currency: string): string {
  const text = exact.format(Math.abs(amount) < 0.005 ? 0 : amount);
  return currency ? `${text} ${currency}` : text;
}

export function formatSignedAmount(amount: number, currency: string): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${formatAmount(Math.abs(amount), currency)}`;
}

/** Axis-friendly: 1,250,000 → "1.25M", 500,000 → "500K", 950 → "950". */
export function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}${trim(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}K`;
  return `${sign}${trim(abs)}`;
}

function trim(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** A fraction as a percentage: 0.2033 → "20.33%". */
export function formatPct(fraction: number, digits = 2): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}
