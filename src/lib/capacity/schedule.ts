import type { PaymentFrequency, ScheduleInput } from "./types";

/**
 * The payment schedule: which fraction of the price is due in which month.
 *
 * Month numbering is 1-based (month 0 is the down payment, handled by the
 * simulation). Year y covers months 12(y−1)+1 … 12y, and a payment "at the end
 * of a period" lands on the period's last month — yearly installments at
 * months 12, 24, …; quarterly at 3, 6, 9, 12 of each year; monthly every
 * month.
 */

export const MIN_PLAN_YEARS = 1;
export const MAX_PLAN_YEARS = 15;

/** A total is "exactly 100%" when it is within this of 1 — IEEE noise, not intent. */
const TOTAL_TOLERANCE = 1e-9;

const PAYMENTS_PER_YEAR: Record<PaymentFrequency, number> = {
  yearly: 1,
  quarterly: 4,
  monthly: 12,
};

/** Each year's fraction of the price, mode-independent. */
export function yearShares(schedule: ScheduleInput): number[] {
  if (schedule.mode === "custom") {
    return schedule.yearShares ?? [];
  }
  const remainder = 1 - schedule.downPayment;
  return Array.from({ length: schedule.planYears }, () => remainder / schedule.planYears);
}

/** Down payment plus every year's share. 1 means the whole price is covered. */
export function scheduleTotal(schedule: ScheduleInput): number {
  return schedule.downPayment + yearShares(schedule).reduce((a, b) => a + b, 0);
}

export function isWholePrice(total: number): boolean {
  return Math.abs(total - 1) <= TOTAL_TOLERANCE;
}

/** Human-readable problems with a schedule; empty when it can be simulated. */
export function validateSchedule(schedule: ScheduleInput): string[] {
  const errors: string[] = [];
  const { planYears, downPayment } = schedule;

  if (!Number.isInteger(planYears) || planYears < MIN_PLAN_YEARS || planYears > MAX_PLAN_YEARS) {
    errors.push(`Plan length must be a whole number of years between ${MIN_PLAN_YEARS} and ${MAX_PLAN_YEARS}.`);
  }
  if (!Number.isFinite(downPayment) || downPayment < 0 || downPayment > 1) {
    errors.push("Down payment must be between 0% and 100%.");
  }

  if (schedule.mode === "custom") {
    const shares = schedule.yearShares ?? [];
    if (shares.length !== planYears) {
      errors.push(`Custom schedule needs one share per year (${planYears}), got ${shares.length}.`);
    }
    if (shares.some((s) => !Number.isFinite(s) || s < 0)) {
      errors.push("A year's share cannot be negative.");
    }
    // Only meaningful once the shape is right; otherwise the message above is
    // the one to act on.
    if (errors.length === 0 && !isWholePrice(scheduleTotal(schedule))) {
      const pct = (scheduleTotal(schedule) * 100).toFixed(2);
      errors.push(`Down payment and yearly shares must total exactly 100% (currently ${pct}%).`);
    }
  }

  return errors;
}

/**
 * Fraction of the price due in each month, indexed 1 … 12·planYears (index 0
 * is unused so month numbers read naturally). Assumes the schedule validates.
 */
export function buildInstallmentShares(schedule: ScheduleInput): number[] {
  const months = schedule.planYears * 12;
  const shares = new Array<number>(months + 1).fill(0);
  const perYear = yearShares(schedule);
  const k = PAYMENTS_PER_YEAR[schedule.frequency];
  const step = 12 / k;

  perYear.forEach((share, i) => {
    if (share === 0) return;
    const yearStart = 12 * i;
    const each = share / k;
    for (let p = 1; p <= k; p++) {
      shares[yearStart + p * step] += each;
    }
  });

  return shares;
}
