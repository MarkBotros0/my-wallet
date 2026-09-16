import type { CompoundingFrequency } from "./types";

/**
 * Rate conversions. All rates are fractions (0.2033, not 20.33).
 *
 * A fund quotes its return either as an EFFECTIVE annual yield (what 1 unit
 * actually grows to in a year) or as a NOMINAL annual rate that is compounded
 * n times a year. The two describe the same growth:
 *
 *   effective = (1 + nominal / n)^n − 1
 *   nominal   = n · ((1 + effective)^(1/n) − 1)
 *
 * Checked against the spec's reference: 20.33% effective is 18.51% nominal
 * compounded daily and 18.65% compounded monthly.
 */

export function effectiveFromNominal(nominal: number, n: CompoundingFrequency): number {
  return Math.pow(1 + nominal / n, n) - 1;
}

export function nominalFromEffective(effective: number, n: CompoundingFrequency): number {
  return n * (Math.pow(1 + effective, 1 / n) - 1);
}

/** The per-period rate that compounds to `effective` over `periods` periods. */
function periodRate(effective: number, periods: number): number {
  return Math.pow(1 + effective, 1 / periods) - 1;
}

/** Monthly growth rate — what the simulation applies each month. */
export function monthlyRate(effective: number): number {
  return periodRate(effective, 12);
}

export function dailyRate(effective: number): number {
  return periodRate(effective, 365);
}
