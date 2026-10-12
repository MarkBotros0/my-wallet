import {
  DEFAULT_STEP,
  purchaseOf,
  type CalculatorInputs,
  type Comparison,
  type PaymentFrequency,
  type SimulationResult,
} from "@/lib/capacity";

/**
 * The deal read back in plain sentences, and the loan's verdict — so a
 * reader can check "did I enter it right?" and "is the loan worth it?"
 * before reading a chart. Pure (no React): amounts stay numbers with a tone
 * — money in, money out, or locked — and the component formats and colours
 * them by the money rule.
 */

export type DealTone = "in" | "out" | "held";
export type DealPart = string | { amount: number; tone: DealTone };
export type DealSentence = DealPart[];

const PER_YEAR: Record<PaymentFrequency, number> = { yearly: 1, quarterly: 4, monthly: 12 };
const EVERY: Record<PaymentFrequency, string> = {
  yearly: "at the end of each year",
  quarterly: "every quarter",
  monthly: "a month",
};
const years = (n: number) => (n === 1 ? "1 year" : `${n} years`);

export function describeDeal(inputs: CalculatorInputs, sim: SimulationResult): DealSentence[] {
  const purchase = purchaseOf(inputs);
  const loan = sim.loan && sim.loan.amount > 0 ? sim.loan : null;
  const terms = inputs.loan;
  const out: DealSentence[] = [];

  const who = purchase.kind === "resale" ? "the seller" : "the developer";
  const what =
    purchase.kind === "developer-plan" ? " as the down payment" : purchase.kind === "developer-cash" ? " (the cash price)" : "";
  const first: DealSentence = [`You pay ${who} `, { amount: sim.upFront, tone: "out" }, ` today${what}`];
  if (loan) {
    first.push(" — ", { amount: loan.amount, tone: "in" }, " from the bank, ", { amount: sim.upFrontFromFund, tone: "out" }, " from savings.");
  } else {
    first.push(", from savings.");
  }
  out.push(first);

  if (loan && terms && loan.pledge > 0) {
    out.push([
      { amount: loan.pledge, tone: "held" },
      " of savings is locked as the bank's guarantee, earning ",
      { amount: (loan.pledge * terms.certificateRate) / 12, tone: "in" },
      " a month; ",
      terms.release === "at-end"
        ? `it all comes back after ${years(terms.years)}.`
        : `it comes back bit by bit as you repay, over ${years(terms.years)}.`,
    ]);
  }

  const clauses: DealSentence[] = [];
  if (loan && terms) {
    clauses.push(["the bank ", { amount: loan.monthlyInstallment, tone: "out" }, ` a month for ${years(terms.years)}`]);
  }
  const developer = developerClause(inputs, sim);
  if (developer) clauses.push(developer);
  out.push(
    clauses.length === 0
      ? ["Nothing is left to pay after that."]
      : ["Then you pay ", ...clauses.flatMap((c, i) => (i === 0 ? c : [", and ", ...c])), "."],
  );

  if (sim.totalExtraCosts > 0) out.push(["Plus ", { amount: sim.totalExtraCosts, tone: "out" }, " in extra costs."]);
  return out;
}

/** What is owed to the developer after the up-front payment, per payment when it is an even split. */
function developerClause(inputs: CalculatorInputs, sim: SimulationResult): DealSentence | null {
  const purchase = purchaseOf(inputs);
  if (purchase.kind === "developer-cash" || sim.totalInstallments <= 0) return null;
  const s = inputs.schedule;
  const frequency = purchase.kind === "resale" ? purchase.resaleFrequency : s.frequency;
  const n = purchase.kind === "resale" ? purchase.resaleYears : s.planYears;
  if (purchase.kind === "developer-plan" && s.mode === "custom") {
    return ["the developer ", { amount: sim.totalInstallments, tone: "out" }, ` over ${years(n)}`];
  }
  return [
    "the developer ",
    { amount: sim.totalInstallments / (n * PER_YEAR[frequency]), tone: "out" },
    ` ${EVERY[frequency]} for ${years(n)}`,
  ];
}

export type LoanVerdictKind = "loan-better" | "no-loan-better" | "same" | "neither";

export interface LoanVerdict {
  kind: LoanVerdictKind;
  /** With-loan maximum − without-loan maximum; an unaffordable side counts as 0. */
  difference: number;
  interest: number;
  certificateInterest: number;
  /** A cash purchase's discount at the with-loan maximum; 0 otherwise. */
  discountSaved: number;
}

export function loanVerdict(inputs: CalculatorInputs, comparison: Comparison, step = DEFAULT_STEP): LoanVerdict {
  const a = comparison.withLoan.maxPrice;
  const b = comparison.withoutLoan.maxPrice;
  const loan = comparison.withLoan.simulation?.loan ?? null;
  const purchase = purchaseOf(inputs);
  const why = {
    interest: loan?.totalInterest ?? 0,
    certificateInterest: loan?.certificateInterest ?? 0,
    discountSaved: purchase.kind === "developer-cash" && a !== null ? a * purchase.cashDiscount : 0,
  };
  if (a === null && b === null) return { kind: "neither", difference: 0, ...why };
  const difference = (a ?? 0) - (b ?? 0);
  // The maxima sit on the solver's grid; one step apart is the same answer.
  const kind = Math.abs(difference) <= step ? "same" : difference > 0 ? "loan-better" : "no-loan-better";
  return { kind, difference, ...why };
}
