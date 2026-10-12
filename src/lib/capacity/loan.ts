import { MAX_PLAN_YEARS, MIN_PLAN_YEARS } from "./schedule";
import type { InputProblem, LoanInput, PledgeRelease } from "./types";

/**
 * A bank loan secured by certificates, priced at a FLAT rate.
 *
 * Flat means the interest is charged on the ORIGINAL amount for every year
 * of the loan — `amount × flatRate × years` in total — and the whole of it,
 * principal plus interest, is repaid in equal monthly installments. The
 * principal inside each installment is `amount / months`, so after k
 * installments `amount × (1 − k/months)` is still owed: that is what a
 * gradual release tracks.
 */

export interface LoanTerms {
  amount: number;
  pledge: number;
  months: number;
  monthlyInstallment: number;
  totalInterest: number;
  /** Nominal annual rate (monthly × 12) of the declining-balance loan with the same installment. */
  equivalentDecliningRate: number;
}

export function loanTerms(loan: LoanInput, upFront: number): LoanTerms {
  const amount = upFront * loan.share;
  const months = loan.years * 12;
  const totalInterest = amount * loan.flatRate * loan.years;
  return {
    amount,
    pledge: amount / loan.lendingRatio,
    months,
    monthlyInstallment: (amount + totalInterest) / months,
    totalInterest,
    equivalentDecliningRate: decliningRateFromFlat(loan.flatRate, loan.years),
  };
}

/** The pledge still locked after `paid` monthly installments. */
export function pledgeHeld(terms: LoanTerms, release: PledgeRelease, paid: number): number {
  if (paid >= terms.months) return 0;
  return release === "at-end" ? terms.pledge : terms.pledge * (1 - paid / terms.months);
}

/**
 * The declining-balance rate a bank would quote for the same monthly
 * installment: solve `i / (1 − (1+i)^−n) = (1 + flat·years) / n` for the
 * monthly rate i by bisection (the annuity factor rises with i), then ×12.
 */
export function decliningRateFromFlat(flatRate: number, years: number): number {
  if (flatRate <= 0) return 0;
  const n = years * 12;
  const payment = (1 + flatRate * years) / n;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 100; k++) {
    const i = (lo + hi) / 2;
    if (i / (1 - Math.pow(1 + i, -n)) > payment) hi = i;
    else lo = i;
  }
  return ((lo + hi) / 2) * 12;
}

/** Problems with a switched-on loan, each naming its field. Messages say what to do. */
export function loanProblems(loan: LoanInput | undefined): InputProblem[] {
  if (!loan?.enabled) return [];
  const problems: InputProblem[] = [];
  const fraction = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
  if (!fraction(loan.share)) {
    problems.push({ field: "loan.share", message: "Borrow between 0% and 100% of what you pay up front." });
  }
  if (!fraction(loan.flatRate)) {
    problems.push({ field: "loan.flatRate", message: "Flat rate must be between 0% and 100% a year." });
  }
  if (!Number.isInteger(loan.years) || loan.years < MIN_PLAN_YEARS || loan.years > MAX_PLAN_YEARS) {
    problems.push({
      field: "loan.years",
      message: `Loan length must be a whole number of years from ${MIN_PLAN_YEARS} to ${MAX_PLAN_YEARS}.`,
    });
  }
  if (!Number.isFinite(loan.lendingRatio) || loan.lendingRatio <= 0 || loan.lendingRatio > 1) {
    problems.push({
      field: "loan.lendingRatio",
      message: "The bank must lend more than 0% and at most 100% of the certificates — most banks lend 90–100%.",
    });
  }
  if (!fraction(loan.certificateRate)) {
    problems.push({ field: "loan.certificateRate", message: "Certificate rate must be between 0% and 100% a year." });
  }
  return problems;
}
