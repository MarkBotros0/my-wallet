import type { YearSummary } from "@/lib/capacity";

/**
 * The two totals a year card reads between Opening and Closing, derived from
 * one YearSummary so the groups cannot drift from the engine's books:
 *
 *   paid        = up-front part from the fund + installments + extra costs
 *                 + bank installments
 *   fromSavings = paid − returns − income − certificate interest
 *                 (negative: returns and income covered more than was paid)
 *
 * and closing = opening − fromSavings − pledged + released.
 */
export function yearStory(y: YearSummary): { paid: number; fromSavings: number } {
  const paid = y.downPayment + y.installments + y.extraCosts + y.bankInstallments;
  return { paid, fromSavings: paid - y.returns - y.income - y.certificateInterest };
}
