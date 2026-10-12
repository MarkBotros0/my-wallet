import { loanProblems, loanTerms, pledgeHeld } from "./loan";
import { activeLoan, buildDeal, horizonYears, purchaseOf, purchaseProblems } from "./purchase";
import { monthlyRate } from "./rates";
import { scheduleProblems } from "./schedule";
import type { CalculatorInputs, InputProblem, MonthPoint, SimulationResult, YearSummary } from "./types";

/**
 * The month-by-month engine.
 *
 * Month 0: the fund pays its share of the up-front payment (the rest is the
 * loan) and the pledge moves from the spendable fund into `held`.
 * Each month 1 … 12·horizon, in this order:
 *   1. growth — spendable × monthly rate × (1 − fee), on a POSITIVE balance
 *               only; certificate interest — held × certificateRate / 12;
 *   2. income — monthly every month, yearly at months 12, 24, …; both grow by
 *               the annual increase once per year;
 *   3. payments — the developer installment due this month, any extra cost
 *               due at the end of this year, and the bank installment while
 *               the loan runs;
 *   4. release — the pledge the bank no longer needs returns to spendable.
 *
 * A price is feasible when the fund's share plus the pledge fits inside the
 * capital, the SPENDABLE balance never drops below the buffer (month 0
 * included) — pledged money cannot cover an emergency — AND the plan ends
 * with at least `minKeptShare` of the starting capital. The horizon covers
 * the loan, so the pledge is always back by the end.
 */

/** Float noise guard: a balance this close to the buffer counts as on it. */
const EPSILON = 1e-6;

/**
 * Problems with the inputs that make a simulation meaningless, each naming
 * the input it is about; empty when fine. This is THE place the input rules
 * are spelled — the form maps the fields onto its own and adds nothing but
 * "is it a number".
 */
export function inputProblems(inputs: CalculatorInputs): InputProblem[] {
  const problems: InputProblem[] = [];
  const { startingCapital, effectiveAnnualRate, income, safetyBuffer, returnFee, schedule } = inputs;

  if (!Number.isFinite(startingCapital) || startingCapital <= 0) {
    problems.push({ field: "startingCapital", message: "Starting capital must be greater than zero." });
  }
  if (!Number.isFinite(effectiveAnnualRate) || effectiveAnnualRate < 0 || effectiveAnnualRate > 1) {
    problems.push({ field: "effectiveAnnualRate", message: "Return rate must be between 0% and 100%." });
  }
  if (!Number.isFinite(safetyBuffer) || safetyBuffer < 0) {
    problems.push({ field: "safetyBuffer", message: "Safety buffer cannot be negative." });
  }
  if (!Number.isFinite(returnFee) || returnFee < 0 || returnFee > 1) {
    problems.push({ field: "returnFee", message: "Fees on returns must be between 0% and 100%." });
  }
  if (!Number.isFinite(inputs.minKeptShare) || inputs.minKeptShare < 0 || inputs.minKeptShare > 1) {
    problems.push({
      field: "minKeptShare",
      message: "Savings to keep at the end must be between 0% and 100% of the starting capital.",
    });
  }
  if (!Number.isFinite(income.amount) || income.amount < 0) {
    problems.push({ field: "income.amount", message: "Extra income cannot be negative." });
  }
  if (!Number.isFinite(income.annualIncrease) || income.annualIncrease < 0 || income.annualIncrease > 1) {
    problems.push({ field: "income.annualIncrease", message: "Income increase must be between 0% and 100% a year." });
  }

  // A resale has no developer plan of its own; the hidden plan fields must
  // not block it.
  if (purchaseOf(inputs).kind !== "resale") problems.push(...scheduleProblems(schedule));
  problems.push(...purchaseProblems(inputs));
  problems.push(...loanProblems(inputs.loan));
  const horizon = horizonYears(inputs);

  for (const [key, label, cost] of [
    ["maintenance", "Maintenance deposit", inputs.maintenance],
    ["finishing", "Finishing cost", inputs.finishing],
  ] as const) {
    if (!Number.isFinite(cost.share) || cost.share < 0 || cost.share > 1) {
      problems.push({ field: `${key}.share`, message: `${label} must be between 0% and 100% of the price.` });
    } else if (cost.share > 0) {
      if (!Number.isInteger(cost.year) || cost.year < 1 || cost.year > horizon) {
        problems.push({
          field: `${key}.year`,
          message: `${label} is due in year ${cost.year}; it must be a whole year from 1 to ${horizon}.`,
        });
      }
    }
  }

  return problems;
}

/** The same problems as plain messages. */
export function validateInputs(inputs: CalculatorInputs): string[] {
  return inputProblems(inputs).map((p) => p.message);
}

/** Extra costs (as a fraction of the deal's cost base) due at the end of each year, index 1 … horizon. */
function extraCostShares(inputs: CalculatorInputs, horizon: number): number[] {
  const shares = new Array<number>(horizon + 1).fill(0);
  for (const cost of [inputs.maintenance, inputs.finishing]) {
    if (cost.share > 0 && cost.year >= 1 && cost.year <= horizon) shares[cost.year] += cost.share;
  }
  return shares;
}

/** Simulate one price through the whole deal. Assumes `validateInputs` is empty. */
export function simulate(inputs: CalculatorInputs, price: number, horizon = horizonYears(inputs)): SimulationResult {
  const { startingCapital, income, safetyBuffer, returnFee, minKeptShare } = inputs;
  const rate = monthlyRate(inputs.effectiveAnnualRate) * (1 - returnFee);
  const deal = buildDeal(inputs, price, horizon);
  const costShares = extraCostShares(inputs, horizon);
  const loan = activeLoan(inputs);
  const terms = loan ? loanTerms(loan, deal.upFront) : null;
  const certificateRate = loan ? loan.certificateRate / 12 : 0;

  const upFrontFromFund = deal.upFront - (terms?.amount ?? 0);
  let held = terms?.pledge ?? 0;
  let balance = startingCapital - upFrontFromFund - held;

  const monthly: MonthPoint[] = [
    {
      month: 0,
      balance,
      returns: 0,
      income: 0,
      installment: 0,
      extraCost: 0,
      certificateInterest: 0,
      bankInstallment: 0,
      released: 0,
      held,
    },
  ];
  const years: YearSummary[] = [];
  let minBalance = balance;
  let firstBreach: SimulationResult["firstBreach"] = null;
  let totalExtraCosts = 0;
  let totalInstallments = 0;
  let totalCertificateInterest = 0;

  const breaches = (b: number) => b < safetyBuffer - EPSILON;
  if (upFrontFromFund + (terms?.pledge ?? 0) > startingCapital + EPSILON || breaches(balance)) {
    firstBreach = { month: 0, shortfall: safetyBuffer - balance };
  }

  for (let year = 1; year <= horizon; year++) {
    // The up-front payment and the pledge are year 1's: that row opens on the
    // capital itself and its lowest balance includes the moment right after.
    const opening = year === 1 ? startingCapital : balance;
    let returns = 0;
    let incomeAdded = 0;
    let installments = 0;
    let extraCosts = 0;
    let certificateInterest = 0;
    let bankInstallments = 0;
    let released = 0;
    let lowest = year === 1 ? balance : Number.POSITIVE_INFINITY;

    const incomeThisYear = income.amount * Math.pow(1 + income.annualIncrease, year - 1);

    for (let m = 1; m <= 12; m++) {
      const month = (year - 1) * 12 + m;

      // 1. growth on spendable money; the pledge earns the certificate rate
      const growth = balance > 0 ? balance * rate : 0;
      const certificate = held * certificateRate;
      balance += growth + certificate;
      returns += growth;
      certificateInterest += certificate;

      // 2. income
      const due = income.frequency === "monthly" ? incomeThisYear : m === 12 ? incomeThisYear : 0;
      balance += due;
      incomeAdded += due;

      // 3. payments
      const installment = deal.developerDue[month];
      const cost = m === 12 ? deal.costBase * costShares[year] : 0;
      const bank = terms && month <= terms.months ? terms.monthlyInstallment : 0;
      balance -= installment + cost + bank;
      installments += installment;
      extraCosts += cost;
      bankInstallments += bank;

      // 4. release
      const nextHeld = terms && loan ? pledgeHeld(terms, loan.release, month) : 0;
      const freed = held - nextHeld;
      held = nextHeld;
      balance += freed;
      released += freed;

      monthly.push({
        month,
        balance,
        returns: growth,
        income: due,
        installment,
        extraCost: cost,
        certificateInterest: certificate,
        bankInstallment: bank,
        released: freed,
        held,
      });
      if (balance < lowest) lowest = balance;
      if (balance < minBalance) minBalance = balance;
      if (firstBreach === null && breaches(balance)) {
        firstBreach = { month, shortfall: safetyBuffer - balance };
      }
    }

    totalExtraCosts += extraCosts;
    totalInstallments += installments;
    totalCertificateInterest += certificateInterest;
    years.push({
      year,
      opening,
      downPayment: year === 1 ? upFrontFromFund : 0,
      returns,
      income: incomeAdded,
      installments,
      extraCosts,
      pledged: year === 1 ? (terms?.pledge ?? 0) : 0,
      released,
      certificateInterest,
      bankInstallments,
      closing: balance,
      lowest,
      breached: breaches(lowest),
    });
  }

  const keepTarget = minKeptShare * startingCapital;
  const endShortfall =
    minKeptShare > 0 && balance < keepTarget - EPSILON ? { target: keepTarget, shortfall: keepTarget - balance } : null;

  return {
    price,
    feasible: firstBreach === null && endShortfall === null,
    downPayment: deal.upFront,
    upFront: deal.upFront,
    upFrontFromFund,
    totalInstallments,
    totalExtraCosts,
    totalCertificateInterest,
    finalBalance: balance,
    minBalance,
    firstBreach,
    endShortfall,
    paidIntoProperty: deal.upFront + totalInstallments + totalExtraCosts,
    keptInFund: balance,
    keptShareOfCapital: startingCapital > 0 ? balance / startingCapital : 0,
    loan: terms
      ? {
          ...terms,
          certificateInterest: totalCertificateInterest,
          netCost: terms.totalInterest - totalCertificateInterest,
        }
      : null,
    horizonYears: horizon,
    monthly,
    years,
  };
}

/**
 * Feasibility of one price. Deliberately the SAME walk as `simulate` — a
 * second, leaner implementation for the solver's probes would be a second
 * place the rules are spelled, and the two would drift. A plan is at most 180
 * months and the solver probes a few hundred prices, so this costs nothing
 * a reader could notice.
 */
export function isFeasible(inputs: CalculatorInputs, price: number, horizon?: number): boolean {
  return simulate(inputs, price, horizon).feasible;
}
