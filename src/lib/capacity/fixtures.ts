import type { CalculatorInputs } from "./types";

/**
 * The spec's reference scenario, shared by the tests: capital 5,000,000 · 12%
 * effective · 8 years · 10% down · equal yearly installments at year end ·
 * maintenance 8% in year 4 · 300,000 yearly income at year end · buffer
 * 500,000 → maximum price 8,860,000.
 */
export const REFERENCE: CalculatorInputs = {
  startingCapital: 5_000_000,
  effectiveAnnualRate: 0.12,
  schedule: { downPayment: 0.1, planYears: 8, mode: "equal", frequency: "yearly" },
  income: { amount: 300_000, frequency: "yearly", annualIncrease: 0 },
  maintenance: { share: 0.08, year: 4 },
  finishing: { share: 0, year: 1 },
  safetyBuffer: 500_000,
  returnFee: 0,
  minKeptShare: 0,
};
