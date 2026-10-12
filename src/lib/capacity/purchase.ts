import { MAX_PLAN_YEARS, MIN_PLAN_YEARS, buildInstallmentShares } from "./schedule";
import type { CalculatorInputs, InputProblem, LoanInput, PurchaseInput } from "./types";

/**
 * How the property is bought, as the engine sees it: an up-front payment at
 * month 0, then an optional stream of developer installments. The three
 * kinds differ only in how `price` maps onto those two:
 *
 *   developer-plan — down payment × price now, the plan's shares × price after;
 *   developer-cash — price × (1 − discount) now, nothing after. `price` stays
 *                    the INSTALLMENT price so its maximum compares with the plan's;
 *   resale         — price (the cash to the seller) now, then the seller's
 *                    fixed remaining balance, split equally over its years.
 */

/** Inputs without a `purchase` are the original calculator: developer installments. */
export const DEFAULT_PURCHASE: PurchaseInput = {
  kind: "developer-plan",
  cashDiscount: 0,
  resaleRemaining: 0,
  resaleYears: 1,
  resaleFrequency: "yearly",
};

export function purchaseOf(inputs: CalculatorInputs): PurchaseInput {
  return inputs.purchase ?? DEFAULT_PURCHASE;
}

/** The loan, when there is one switched on. */
export function activeLoan(inputs: CalculatorInputs): LoanInput | null {
  return inputs.loan?.enabled ? inputs.loan : null;
}

/**
 * Years of the developer stream. A cash purchase still reports the plan's
 * years: that plan is its no-loan alternative, and both sides of a
 * comparison must end on the same month.
 */
export function developerYears(inputs: CalculatorInputs): number {
  const p = purchaseOf(inputs);
  return p.kind === "resale" ? p.resaleYears : inputs.schedule.planYears;
}

/** How long to simulate: until both the developer and the bank are paid. */
export function horizonYears(inputs: CalculatorInputs): number {
  const loan = activeLoan(inputs);
  return Math.max(developerYears(inputs), loan ? loan.years : 0);
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
    case "developer-cash": {
      const cash = price * (1 - p.cashDiscount);
      return { upFront: cash, developerDue, costBase: cash };
    }
    case "resale":
      spread(
        buildInstallmentShares({ downPayment: 0, planYears: p.resaleYears, mode: "equal", frequency: p.resaleFrequency }),
        p.resaleRemaining,
      );
      return { upFront: price, developerDue, costBase: price + p.resaleRemaining };
    default:
      spread(buildInstallmentShares(inputs.schedule), price);
      return { upFront: price * inputs.schedule.downPayment, developerDue, costBase: price };
  }
}

/** Problems with the purchase's own inputs, each naming its field; empty when fine. */
export function purchaseProblems(inputs: CalculatorInputs): InputProblem[] {
  const p = purchaseOf(inputs);
  const problems: InputProblem[] = [];
  if (p.kind === "developer-cash" && (!Number.isFinite(p.cashDiscount) || p.cashDiscount < 0 || p.cashDiscount >= 1)) {
    problems.push({ field: "purchase.cashDiscount", message: "Cash discount must be at least 0% and less than 100%." });
  }
  if (p.kind === "resale") {
    if (!Number.isFinite(p.resaleRemaining) || p.resaleRemaining < 0) {
      problems.push({
        field: "purchase.resaleRemaining",
        message: "What's still owed to the developer cannot be negative — enter 0 if the seller has paid it all.",
      });
    }
    if (!Number.isInteger(p.resaleYears) || p.resaleYears < MIN_PLAN_YEARS || p.resaleYears > MAX_PLAN_YEARS) {
      problems.push({
        field: "purchase.resaleYears",
        message: `Years left must be a whole number from ${MIN_PLAN_YEARS} to ${MAX_PLAN_YEARS}.`,
      });
    }
  }
  return problems;
}
