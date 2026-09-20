import { monthlyRate } from "./rates";
import { buildInstallmentShares, scheduleProblems } from "./schedule";
import type { CalculatorInputs, InputProblem, MonthPoint, SimulationResult, YearSummary } from "./types";

/**
 * The month-by-month engine.
 *
 * Month 0: balance = starting capital − down payment.
 * Each month 1 … 12·years, in this order:
 *   1. growth  — balance × monthly rate × (1 − fee), on a POSITIVE balance only
 *                (there is no return on money you do not have, and this model
 *                does not borrow);
 *   2. income  — monthly income every month, yearly income at months 12, 24, …;
 *                both grow by the annual increase once per year;
 *   3. payments — the installment share due this month (see schedule.ts) and
 *                any extra cost due at the end of this year, both × price.
 *
 * A price is feasible when the down payment fits inside the capital, the
 * balance never drops below the safety buffer at any month (month 0 included),
 * AND the plan ends with at least `minKeptShare` of the starting capital still
 * in the fund.
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

  problems.push(...scheduleProblems(schedule));

  for (const [key, label, cost] of [
    ["maintenance", "Maintenance deposit", inputs.maintenance],
    ["finishing", "Finishing cost", inputs.finishing],
  ] as const) {
    if (!Number.isFinite(cost.share) || cost.share < 0 || cost.share > 1) {
      problems.push({ field: `${key}.share`, message: `${label} must be between 0% and 100% of the price.` });
    } else if (cost.share > 0) {
      if (!Number.isInteger(cost.year) || cost.year < 1 || cost.year > schedule.planYears) {
        problems.push({
          field: `${key}.year`,
          message: `${label} is due in year ${cost.year}; it must be a whole year from 1 to ${schedule.planYears}.`,
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

/** Extra costs (as a fraction of the price) due at the end of each year, index 1 … years. */
function extraCostShares(inputs: CalculatorInputs): number[] {
  const shares = new Array<number>(inputs.schedule.planYears + 1).fill(0);
  for (const cost of [inputs.maintenance, inputs.finishing]) {
    if (cost.share > 0 && cost.year >= 1 && cost.year <= inputs.schedule.planYears) {
      shares[cost.year] += cost.share;
    }
  }
  return shares;
}

/** Simulate one price through the whole plan. Assumes `validateInputs` is empty. */
export function simulate(inputs: CalculatorInputs, price: number): SimulationResult {
  const { startingCapital, schedule, income, safetyBuffer, returnFee, minKeptShare } = inputs;
  const rate = monthlyRate(inputs.effectiveAnnualRate) * (1 - returnFee);
  const installmentShares = buildInstallmentShares(schedule);
  const costShares = extraCostShares(inputs);

  const downPayment = price * schedule.downPayment;
  let balance = startingCapital - downPayment;

  const monthly: MonthPoint[] = [{ month: 0, balance, returns: 0, income: 0, installment: 0, extraCost: 0 }];
  const years: YearSummary[] = [];
  let minBalance = balance;
  let firstBreach: SimulationResult["firstBreach"] = null;
  let totalExtraCosts = 0;

  const breaches = (b: number) => b < safetyBuffer - EPSILON;
  if (downPayment > startingCapital + EPSILON || breaches(balance)) {
    firstBreach = { month: 0, shortfall: safetyBuffer - balance };
  }

  for (let year = 1; year <= schedule.planYears; year++) {
    const opening = balance;
    let returns = 0;
    let incomeAdded = 0;
    let installments = 0;
    let extraCosts = 0;
    let lowest = Number.POSITIVE_INFINITY;

    // The income amount steps up once per year, not once per payment.
    const incomeThisYear = income.amount * Math.pow(1 + income.annualIncrease, year - 1);

    for (let m = 1; m <= 12; m++) {
      const month = (year - 1) * 12 + m;

      // 1. growth
      const growth = balance > 0 ? balance * rate : 0;
      balance += growth;
      returns += growth;

      // 2. income
      const due = income.frequency === "monthly" ? incomeThisYear : m === 12 ? incomeThisYear : 0;
      balance += due;
      incomeAdded += due;

      // 3. payments
      const installment = price * installmentShares[month];
      const cost = m === 12 ? price * costShares[year] : 0;
      balance -= installment + cost;
      installments += installment;
      extraCosts += cost;

      monthly.push({ month, balance, returns: growth, income: due, installment, extraCost: cost });
      if (balance < lowest) lowest = balance;
      if (balance < minBalance) minBalance = balance;
      if (firstBreach === null && breaches(balance)) {
        firstBreach = { month, shortfall: safetyBuffer - balance };
      }
    }

    totalExtraCosts += extraCosts;
    years.push({
      year,
      opening,
      returns,
      income: incomeAdded,
      installments,
      extraCosts,
      closing: balance,
      lowest,
      breached: breaches(lowest),
    });
  }

  // The end-of-plan target: what the user wants left over, stated against the
  // capital they started with rather than against the price.
  const keepTarget = minKeptShare * startingCapital;
  const endShortfall =
    minKeptShare > 0 && balance < keepTarget - EPSILON ? { target: keepTarget, shortfall: keepTarget - balance } : null;

  return {
    price,
    feasible: firstBreach === null && endShortfall === null,
    downPayment,
    totalInstallments: price - downPayment,
    totalExtraCosts,
    finalBalance: balance,
    minBalance,
    firstBreach,
    endShortfall,
    paidIntoProperty: price + totalExtraCosts,
    keptInFund: balance,
    keptShareOfCapital: startingCapital > 0 ? balance / startingCapital : 0,
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
export function isFeasible(inputs: CalculatorInputs, price: number): boolean {
  return simulate(inputs, price).feasible;
}
