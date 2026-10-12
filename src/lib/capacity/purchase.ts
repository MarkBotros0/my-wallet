import { MAX_PLAN_YEARS, buildInstallmentShares, lastInstallmentMonth, paymentsPerYear } from "./schedule";
import type { CalculatorInputs, InputProblem, LoanInput, PurchaseInput } from "./types";

/**
 * How the property is bought, as the engine sees it: an up-front payment at
 * month 0, then an optional stream of developer installments. The two
 * kinds differ only in how `price` maps onto those two:
 *
 *   developer-plan — with net = price × (1 − discount): down payment × net now,
 *                    the plan's shares × net after, costs on net. `price` stays
 *                    the LIST price so plans' maxima compare; a down payment of
 *                    100% is a cash purchase (nothing after);
 *   resale         — price (the cash to the seller) now, then the seller's
 *                    fixed remaining balance, split equally over its installments.
 */

/** Inputs without a `purchase` are the original calculator: developer installments. */
export const DEFAULT_PURCHASE: PurchaseInput = {
  kind: "developer-plan",
  discount: 0,
  resaleRemaining: 0,
  resaleInstallments: 1,
  resaleFrequency: "yearly",
};

export function purchaseOf(inputs: CalculatorInputs): PurchaseInput {
  return inputs.purchase ?? DEFAULT_PURCHASE;
}

/** The loan, when there is one switched on. */
export function activeLoan(inputs: CalculatorInputs): LoanInput | null {
  return inputs.loan?.enabled ? inputs.loan : null;
}

/** Years of the developer stream (the plan's years even when nothing falls due after the down payment). */
export function developerYears(inputs: CalculatorInputs): number {
  const p = purchaseOf(inputs);
  return p.kind === "resale" ? Math.ceil(lastInstallmentMonth(p.resaleInstallments, p.resaleFrequency) / 12) : inputs.schedule.planYears;
}

/** A year an extra cost falls due, as a horizon: whole and at least 1 (bad values are `inputProblems`' to report). */
function costYear(cost: { share: number; year: number }): number {
  return cost.share > 0 && Number.isFinite(cost.year) ? Math.max(1, Math.floor(cost.year)) : 0;
}

/**
 * How long to simulate: until the developer, the bank and the last extra cost
 * (maintenance, finishing) have all been paid.
 */
export function horizonYears(inputs: CalculatorInputs): number {
  const loan = activeLoan(inputs);
  return Math.max(
    developerYears(inputs),
    loan ? loan.years : 0,
    costYear(inputs.maintenance),
    costYear(inputs.finishing),
  );
}

export interface Deal {
  /** Paid at month 0, by the fund and the loan together. */
  upFront: number;
  /** Developer installment due each month, index 1 … 12·horizon (index 0 unused). */
  developerDue: number[];
  /** What the extra costs (maintenance, finishing) are a share of. */
  costBase: number;
}

/** The payments one price means for this purchase. Assumes `purchaseProblems` is empty. */
export function buildDeal(inputs: CalculatorInputs, price: number, horizon: number): Deal {
  const months = horizon * 12;
  const developerDue = new Array<number>(months + 1).fill(0);
  const spread = (shares: number[], scale: number) => {
    for (let m = 1; m < shares.length && m <= months; m++) developerDue[m] += shares[m] * scale;
  };
  const p = purchaseOf(inputs);
  switch (p.kind) {
    case "resale":
      const step = 12 / paymentsPerYear(p.resaleFrequency);
      const each = p.resaleRemaining / p.resaleInstallments;
      for (let k = 1; k <= p.resaleInstallments && k * step <= months; k++) developerDue[k * step] += each;
      return { upFront: price, developerDue, costBase: price + p.resaleRemaining };
    default: {
      const net = price * (1 - p.discount);
      spread(buildInstallmentShares(inputs.schedule), net);
      return { upFront: net * inputs.schedule.downPayment, developerDue, costBase: net };
    }
  }
}

/** Problems with the purchase's own inputs, each naming its field; empty when fine. */
export function purchaseProblems(inputs: CalculatorInputs): InputProblem[] {
  const p = purchaseOf(inputs);
  const problems: InputProblem[] = [];
  if (p.kind === "developer-plan" && (!Number.isFinite(p.discount) || p.discount < 0 || p.discount >= 1)) {
    problems.push({ field: "purchase.discount", message: "Discount must be at least 0% and less than 100%." });
  }
  if (p.kind === "resale") {
    if (!Number.isFinite(p.resaleRemaining) || p.resaleRemaining < 0) {
      problems.push({
        field: "purchase.resaleRemaining",
        message: "What's still owed to the developer cannot be negative — enter 0 if the seller has paid it all.",
      });
    }
    const max = MAX_PLAN_YEARS * paymentsPerYear(p.resaleFrequency);
    if (!Number.isInteger(p.resaleInstallments) || p.resaleInstallments < 1 || p.resaleInstallments > max) {
      problems.push({
        field: "purchase.resaleInstallments",
        message: `Installments left must be a whole number from 1 to ${max}.`,
      });
    }
  }
  return problems;
}
