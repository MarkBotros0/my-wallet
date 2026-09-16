/**
 * Installment buying-capacity calculator — public surface.
 *
 * Pure TypeScript: no React, no Next, no database. See types.ts for the two
 * conventions (fractions, plain currency numbers) every function follows.
 */
export * from "./types";
export { dailyRate, effectiveFromNominal, monthlyRate, nominalFromEffective } from "./rates";
export {
  MAX_PLAN_YEARS,
  MIN_PLAN_YEARS,
  buildInstallmentShares,
  isWholePrice,
  scheduleTotal,
  validateSchedule,
  yearShares,
} from "./schedule";
export { isFeasible, simulate, validateInputs } from "./simulate";
export { DEFAULT_SENSITIVITY_DELTAS, DEFAULT_STEP, maxFeasiblePrice, sensitivity } from "./solve";
