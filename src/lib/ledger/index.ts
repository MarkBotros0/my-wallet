/**
 * The transactions ledger — pure helpers shared by the API routes and the
 * page. No React, no Next, no database.
 */
export * from "./types";
export {
  isIsoDate,
  isMonthKey,
  isYearKey,
  monthKeyOf,
  monthLabel,
  monthName,
  monthRange,
  shiftMonth,
  toIsoDate,
  yearOf,
  yearRange,
} from "./months";
export { groupByDay, summarize } from "./summarize";
export { DEFAULT_GODS_SHARE_RATE, defaultGodsShare, godsShareTotals } from "./godsShare";
export { clientBars, monthlyIncome, type ClientBar, type ClientFilter } from "./summary";
export {
  MAX_AMOUNT,
  MAX_CLIENT_NAME_LENGTH,
  MAX_CLIENT_NOTE_LENGTH,
  validateClientInput,
  validateTransactionInput,
  type ClientValidationResult,
  type ValidationResult,
} from "./validate";
