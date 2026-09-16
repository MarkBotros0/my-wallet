import { isFeasible, simulate } from "./simulate";
import type { CalculatorInputs, CapacityResult, SensitivityRow } from "./types";

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

export function maxFeasiblePrice(inputs: CalculatorInputs, step = DEFAULT_STEP): CapacityResult {
  // If not even a free property keeps the balance above the buffer, or one
  // step of price already breaks it, nothing on the grid is affordable.
  if (!isFeasible(inputs, 0) || !isFeasible(inputs, step)) {
    return { maxPrice: null, simulation: null };
  }

  // Bracket: grow the upper bound until it fails. Start from the capital —
  // the answer is usually within a small multiple of it.
  let lo = 1; // in steps, known feasible
  let hi = Math.max(2, Math.ceil(inputs.startingCapital / step)); // in steps
  let doublings = 0;
  while (isFeasible(inputs, hi * step)) {
    lo = hi;
    hi *= 2;
    if (++doublings > MAX_DOUBLINGS) break;
  }

  // Bisect on the step grid: lo feasible, hi infeasible.
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (isFeasible(inputs, mid * step)) lo = mid;
    else hi = mid;
  }

  const maxPrice = lo * step;
  return { maxPrice, simulation: simulate(inputs, maxPrice) };
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
): SensitivityRow[] {
  return deltas.map((delta) => {
    const effectiveAnnualRate = Math.max(0, inputs.effectiveAnnualRate + delta);
    const { maxPrice } = maxFeasiblePrice({ ...inputs, effectiveAnnualRate }, step);
    return { delta, effectiveAnnualRate, maxPrice };
  });
}
