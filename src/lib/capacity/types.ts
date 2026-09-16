/**
 * Installment buying-capacity calculator — the shared vocabulary.
 *
 * This module (src/lib/capacity) is pure: no React, no Next, no database. The
 * UI converts what the user typed into these shapes and formats what comes
 * back; every number in here follows two conventions, so the maths never has
 * to guess:
 *
 *   - Every rate and percentage is a FRACTION. 20.33% is 0.2033, a 10% down
 *     payment is 0.10. The UI multiplies by 100 at the edge and nowhere else.
 *   - Every amount is in the user's currency, as a plain number.
 */

/** Compounding periods per year for a nominal rate. */
export type CompoundingFrequency = 1 | 4 | 12 | 365;

/** How many installments a year's share of the price is split into. */
export type PaymentFrequency = "yearly" | "quarterly" | "monthly";

export type IncomeFrequency = "monthly" | "yearly";

export interface ScheduleInput {
  /** Fraction of the price paid at month 0. */
  downPayment: number;
  /** Installment period in whole years, 1–15. */
  planYears: number;
  /**
   * "equal"  — the remainder (1 − downPayment) is split evenly across years.
   * "custom" — `yearShares[i]` is year i+1's fraction of the price; together
   *            with the down payment they must sum to exactly 1.
   */
  mode: "equal" | "custom";
  yearShares?: number[];
  /** Within a year, its share is split equally across these payments. */
  frequency: PaymentFrequency;
}

export interface IncomeInput {
  amount: number;
  frequency: IncomeFrequency;
  /** Fraction by which the amount grows each year (0 = flat). */
  annualIncrease: number;
}

/** A one-off cost expressed as a fraction of the price, due at the END of `year`. */
export interface ExtraCost {
  share: number;
  year: number;
}

export interface CalculatorInputs {
  startingCapital: number;
  /** Effective annual yield of the fund, as a fraction. */
  effectiveAnnualRate: number;
  schedule: ScheduleInput;
  income: IncomeInput;
  /** Maintenance deposit — `share: 0` disables it. */
  maintenance: ExtraCost;
  /** Finishing cost — `share: 0` disables it. */
  finishing: ExtraCost;
  /** The balance must never drop below this. */
  safetyBuffer: number;
  /** Fraction of each period's fund return lost to fees/taxes (0 = none). */
  returnFee: number;
  /**
   * Share of the STARTING capital that must still be in the fund when the
   * plan ends — "keep 30% of my savings" — as a fraction. 0 = no requirement.
   */
  minKeptShare: number;
}

export interface MonthPoint {
  /** 0 = right after the down payment; 1..12·years thereafter. */
  month: number;
  balance: number;
}

export interface YearSummary {
  year: number;
  opening: number;
  returns: number;
  income: number;
  installments: number;
  extraCosts: number;
  closing: number;
  /** Lowest end-of-month balance seen during the year. */
  lowest: number;
  breached: boolean;
}

export interface SimulationResult {
  price: number;
  feasible: boolean;
  downPayment: number;
  /** Everything owed after the down payment, excluding extra costs. */
  totalInstallments: number;
  totalExtraCosts: number;
  finalBalance: number;
  minBalance: number;
  /** The first month the balance dropped below the buffer, if it ever did. */
  firstBreach: { month: number; shortfall: number } | null;
  /** Set when the plan ends below the keep target (target = minKeptShare × capital). */
  endShortfall: { target: number; shortfall: number } | null;
  /** Down payment + installments + extra costs: what left the fund for the property. */
  paidIntoProperty: number;
  /** What is still in the fund when the plan ends — the final balance, named for the reader. */
  keptInFund: number;
  /** keptInFund as a share of the starting capital. */
  keptShareOfCapital: number;
  monthly: MonthPoint[];
  years: YearSummary[];
}

export interface CapacityResult {
  /** Largest feasible price at the requested step, or null if nothing is affordable. */
  maxPrice: number | null;
  /** The simulation at `maxPrice`, for the tables and chart. */
  simulation: SimulationResult | null;
}

export interface SensitivityRow {
  /** The effective annual rate this row was solved at. */
  effectiveAnnualRate: number;
  /** Difference from the current rate (e.g. -0.03). */
  delta: number;
  maxPrice: number | null;
}
