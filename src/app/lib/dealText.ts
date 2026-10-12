import {
  DEFAULT_STEP,
  purchaseOf,
  type CalculatorInputs,
  type Comparison,
  type PaymentFrequency,
  type SimulationResult,
  type TopUpResult,
} from "@/lib/capacity";

/**
 * The deal read back in plain sentences, and the loan's verdict — so a
 * reader can check "did I enter it right?" and "is the loan worth it?"
 * before reading a chart. Pure (no React): amounts stay numbers with a tone
 * — money in, money out, or locked — and the component formats and colours
 * them by the money rule.
 */

/** `neutral`: an amount that compares two outcomes — no money moves, so no money colour. */
export type DealTone = "in" | "out" | "held" | "neutral";
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

  const first: DealSentence =
    purchase.kind === "resale"
      ? ["You pay the seller ", { amount: sim.upFront, tone: "out" }, " today"]
      : ["You pay the developer ", { amount: sim.upFront, tone: "out" }, ` today (${planNow(inputs)})`];
  if (loan && sim.upFrontFromFund < 0.5) {
    // The bank pays it all: "0 from savings" would be a number saying nothing.
    first.push(" — all of it from the bank.");
  } else if (loan) {
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

const pct = (fraction: number) => `${parseFloat((fraction * 100).toFixed(1))}%`;

/** The parenthesis of a developer plan's first sentence: how much of the price is paid now, after any discount. */
function planNow(inputs: CalculatorInputs): string {
  const now = inputs.schedule.downPayment;
  const { discount } = purchaseOf(inputs);
  const off = discount > 0 ? ` after ${pct(discount)} off` : "";
  return now >= 1 ? `the whole price${off}` : `${pct(now)} of the price${off}`;
}

/** What is owed to the developer after the up-front payment, per payment when it is an even split. */
function developerClause(inputs: CalculatorInputs, sim: SimulationResult): DealSentence | null {
  const purchase = purchaseOf(inputs);
  if (sim.totalInstallments <= 0) return null;
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
}

export function loanVerdict(_inputs: CalculatorInputs, comparison: Comparison, step = DEFAULT_STEP): LoanVerdict {
  const a = comparison.withLoan.maxPrice;
  const b = comparison.withoutLoan.maxPrice;
  const loan = comparison.withLoan.simulation?.loan ?? null;
  const why = {
    interest: loan?.totalInterest ?? 0,
    certificateInterest: loan?.certificateInterest ?? 0,
  };
  if (a === null && b === null) return { kind: "neither", difference: 0, ...why };
  const difference = (a ?? 0) - (b ?? 0);
  // The maxima sit on the solver's grid; one step apart is the same answer.
  const kind = Math.abs(difference) <= step ? "same" : difference > 0 ? "loan-better" : "no-loan-better";
  return { kind, difference, ...why };
}

/** The top-up a plan needs, in words. `annualIncrease` is the income's yearly raise (0 = flat). */
export function topUpSentence(
  result: TopUpResult,
  incomeFrequency: "monthly" | "yearly",
  annualIncrease = 0,
): DealSentence {
  const { topUp, blocker, simulation } = result;
  if (topUp === null) {
    if (blocker === "day-one") {
      return [
        "No top-up can fix this: on day one you need ",
        { amount: simulation.firstBreach?.shortfall ?? 0, tone: "neutral" },
        " more savings than you have.",
      ];
    }
    if (blocker === "too-early") {
      return [`No top-up can fix this: a payment in month ${simulation.firstBreach?.month ?? 0} comes before the first top-up arrives.`];
    }
    return ["No top-up can make this work."];
  }
  if (topUp <= 0) return ["Your savings and income already carry this plan — no top-up needed."];
  const s: DealSentence = ["Add ", { amount: topUp, tone: "in" }, " a year on top of your income"];
  if (incomeFrequency === "monthly") s.push(" (", { amount: topUp / 12, tone: "in" }, "/month)");
  if (annualIncrease > 0) s.push(", growing with your raise");
  s.push(".");
  return s;
}

export type TopUpVerdictKind = "loan-better" | "no-loan-better" | "same" | "neither";

export interface TopUpVerdict {
  kind: TopUpVerdictKind;
  /** Without-loan top-up − with-loan top-up; positive = the loan saves you that much a year. 0 when a side is blocked. */
  difference: number;
  interest: number;
  certificateInterest: number;
  headline: DealSentence;
}

/** Whether the loan lowers the yearly top-up, as one headline sentence. */
export function loanVerdictTopUp(cmp: { withLoan: TopUpResult; withoutLoan: TopUpResult }): TopUpVerdict {
  const a = cmp.withLoan.topUp;
  const b = cmp.withoutLoan.topUp;
  const loan = cmp.withLoan.simulation.loan;
  const why = { interest: loan?.totalInterest ?? 0, certificateInterest: loan?.certificateInterest ?? 0 };
  if (a === null && b === null) {
    return { kind: "neither", difference: 0, ...why, headline: ["No top-up makes this work, with or without the loan."] };
  }
  if (b === null) {
    return { kind: "loan-better", difference: 0, ...why, headline: ["Without the loan no top-up can make this work."] };
  }
  if (a === null) {
    return { kind: "no-loan-better", difference: 0, ...why, headline: ["With the loan no top-up can make this work."] };
  }
  const difference = b - a;
  if (Math.abs(difference) <= DEFAULT_STEP) {
    return { kind: "same", difference, ...why, headline: ["The loan does not change the top-up you need."] };
  }
  return difference > 0
    ? { kind: "loan-better", difference, ...why, headline: ["Without the loan you'd add ", { amount: difference, tone: "neutral" }, " a year more."] }
    : { kind: "no-loan-better", difference, ...why, headline: ["Without the loan you'd add ", { amount: -difference, tone: "neutral" }, " a year less."] };
}
