import { horizonYears } from "./purchase";
import { isFeasible, simulate } from "./simulate";
import type {
  Ask,
  CalculatorInputs,
  CapacityResult,
  Comparison,
  PlanResult,
  SensitivityRow,
  TopUpResult,
} from "./types";

/**
 * Find the most expensive property the plan can carry.
 *
 * Feasibility is monotonic in price — a higher price means a larger payment at
 * every point and therefore a lower balance at every point — so the feasible
 * prices form a prefix of the number line and binary search finds its edge.
 * Prices are probed on a grid of `step` (default 1,000) and the answer is the
 * largest grid point that is feasible.
 */

export const DEFAULT_STEP = 1_000;

/** Doubling past this many times means the inputs are pathological, not affordable. */
const MAX_DOUBLINGS = 64;

export function maxFeasiblePrice(
  inputs: CalculatorInputs,
  step = DEFAULT_STEP,
  horizon = horizonYears(inputs),
): CapacityResult {
  // If not even a free property keeps the balance above the buffer, or one
  // step of price already breaks it, nothing on the grid is affordable.
  if (!isFeasible(inputs, 0, horizon) || !isFeasible(inputs, step, horizon)) {
    return { maxPrice: null, simulation: null };
  }

  // Bracket: grow the upper bound until it fails. Start from the capital —
  // the answer is usually within a small multiple of it.
  let lo = 1; // in steps, known feasible
  let hi = Math.max(2, Math.ceil(inputs.startingCapital / step)); // in steps
  let doublings = 0;
  while (isFeasible(inputs, hi * step, horizon)) {
    lo = hi;
    hi *= 2;
    if (++doublings > MAX_DOUBLINGS) break;
  }

  // Bisect on the step grid: lo feasible, hi infeasible.
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (isFeasible(inputs, mid * step, horizon)) lo = mid;
    else hi = mid;
  }

  const maxPrice = lo * step;
  return { maxPrice, simulation: simulate(inputs, maxPrice, horizon) };
}

export const DEFAULT_SENSITIVITY_DELTAS = [-0.06, -0.03, 0, 0.03] as const;

/**
 * Buying capacity at a few return rates around the current one — fund returns
 * change, and the reader should see how much the answer leans on the rate.
 * Rates are clamped at 0%: a fund does not pay a negative yield.
 */
export function sensitivity(
  inputs: CalculatorInputs,
  deltas: readonly number[] = DEFAULT_SENSITIVITY_DELTAS,
  step = DEFAULT_STEP,
  horizon?: number,
): SensitivityRow[] {
  return deltas.map((delta) => {
    const effectiveAnnualRate = Math.max(0, inputs.effectiveAnnualRate + delta);
    const { maxPrice } = maxFeasiblePrice({ ...inputs, effectiveAnnualRate }, step, horizon);
    return { delta, effectiveAnnualRate, maxPrice };
  });
}

/**
 * The least yearly top-up that makes `price` work.
 *
 * Feasibility is monotonic in the top-up (more money at every point never
 * hurts), so: 0 when the price already works; otherwise bracket by doubling
 * from one step and bisect on the step grid. When even an enormous top-up
 * (1e12) fails, top-ups cannot help — `blocker` says why: "day-one" if the
 * first breach is month 0 (the up-front payment or pledge needs more savings
 * than there are), else "too-early" (a payment falls due before the first
 * top-up arrives). An end-shortfall-only failure is always fixable by top-ups,
 * so it never reaches the blocker.
 */
export function minTopUp(
  inputs: CalculatorInputs,
  price: number,
  step = DEFAULT_STEP,
  horizon = horizonYears(inputs),
): TopUpResult {
  const at = (topUp: number) => simulate({ ...inputs, topUp }, price, horizon);
  const base = at(0);
  if (base.feasible) return { topUp: 0, simulation: base, blocker: null };
  // 1e12 stands for "unlimited": prices needing more than that a year are outside the app's range.
  if (!at(1e12).feasible) {
    return { topUp: null, simulation: base, blocker: base.firstBreach?.month === 0 ? "day-one" : "too-early" };
  }

  const unit = Math.max(step, 1);
  let lo = 0; // in units, known infeasible
  let hi = 1; // in units
  while (!at(hi * unit).feasible) {
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (at(mid * unit).feasible) hi = mid;
    else lo = mid;
  }
  return { topUp: hi * unit, simulation: at(hi * unit), blocker: null };
}

/** Years to simulate so several plans end on the same date: the longest horizon, at least 1. */
export function commonHorizon(plans: CalculatorInputs[]): number {
  return Math.max(1, ...plans.map(horizonYears));
}

/**
 * Solve every plan over ONE horizon. "max" finds each plan's maximum list
 * price; "topUp" finds the least yearly top-up for the price asked about
 * (`prices[i]` for plan i). A plan with no (or a non-finite) price is not
 * solved: it returns all nulls.
 */
export function solvePlans(plans: CalculatorInputs[], ask: Ask, step = DEFAULT_STEP): PlanResult[] {
  const horizon = commonHorizon(plans);
  return plans.map((plan, i) => {
    if (ask.mode === "max") {
      const { maxPrice, simulation } = maxFeasiblePrice(plan, step, horizon);
      return { price: maxPrice, topUp: null, blocker: null, simulation };
    }
    const price = ask.prices[i];
    if (price === undefined || !Number.isFinite(price)) return { price: null, topUp: null, blocker: null, simulation: null };
    const r = minTopUp(plan, price, step, horizon);
    return { price, topUp: r.topUp, blocker: r.blocker, simulation: r.simulation };
  });
}

/** Index of the best plan: highest price (max) or lowest top-up (topUp); ties go to the first; nulls never win. */
export function bestPlan(results: PlanResult[], mode: Ask["mode"]): number | null {
  let best: number | null = null;
  let bestValue = 0;
  results.forEach((r, i) => {
    const value = mode === "max" ? r.price : r.topUp;
    if (value === null) return;
    if (best === null || (mode === "max" ? value > bestValue : value < bestValue)) {
      best = i;
      bestValue = value;
    }
  });
  return best;
}

/** The top-up needed at a few return rates around the current one (the rate clamps at 0%). */
export function topUpSensitivity(
  inputs: CalculatorInputs,
  price: number,
  deltas: readonly number[] = DEFAULT_SENSITIVITY_DELTAS,
  step = DEFAULT_STEP,
  horizon?: number,
): { delta: number; effectiveAnnualRate: number; topUp: number | null }[] {
  return deltas.map((delta) => {
    const effectiveAnnualRate = Math.max(0, inputs.effectiveAnnualRate + delta);
    const { topUp } = minTopUp({ ...inputs, effectiveAnnualRate }, price, step, horizon);
    return { delta, effectiveAnnualRate, topUp };
  });
}

/** The same purchase paid without the bank: the loan switched off, nothing else changes. */
export function withoutLoan(inputs: CalculatorInputs): CalculatorInputs {
  return { ...inputs, loan: inputs.loan ? { ...inputs.loan, enabled: false } : undefined };
}

/**
 * "Is the loan worth it?" — both maxima, and both simulations at a price
 * being checked, over ONE horizon (the deal's, unless one is given) so the
 * two final balances are measured on the same date.
 */
export function compare(
  inputs: CalculatorInputs,
  testPrice: number | null = null,
  step = DEFAULT_STEP,
  horizon = horizonYears(inputs),
): Comparison {
  const base = withoutLoan(inputs);
  return {
    horizonYears: horizon,
    withLoan: maxFeasiblePrice(inputs, step, horizon),
    withoutLoan: maxFeasiblePrice(base, step, horizon),
    tested:
      testPrice === null
        ? null
        : { withLoan: simulate(inputs, testPrice, horizon), withoutLoan: simulate(base, testPrice, horizon) },
  };
}

/** The loan question in top-up mode: the least yearly top-up with and without the loan, over one horizon. */
export function compareTopUp(
  inputs: CalculatorInputs,
  price: number,
  step = DEFAULT_STEP,
  horizon = horizonYears(inputs),
): { horizonYears: number; withLoan: TopUpResult; withoutLoan: TopUpResult } {
  return {
    horizonYears: horizon,
    withLoan: minTopUp(inputs, price, step, horizon),
    withoutLoan: minTopUp(withoutLoan(inputs), price, step, horizon),
  };
}
