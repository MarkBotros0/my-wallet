import type { YearSummary } from "@/lib/capacity";

/**
 * The two totals a year card reads between Opening and Closing, derived from
 * one YearSummary so the groups cannot drift from the engine's books:
 *
 *   paid        = the FULL up-front payment (fund and bank's part) + installments + extra costs
 *                 + bank installments
 *   fromSavings = paid − returns − income − top-up − certificate interest − loan received
 *                 (negative: returns and income covered more than was paid)
 *
 * and closing = opening − fromSavings − pledged + released.
 */
export function yearStory(y: YearSummary): { paid: number; fromSavings: number } {
  const paid = y.upFront + y.installments + y.extraCosts + y.bankInstallments;
  return { paid, fromSavings: paid - y.returns - y.income - y.topUp - y.certificateInterest - y.loanReceived };
}
