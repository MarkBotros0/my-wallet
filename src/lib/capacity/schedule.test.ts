import { describe, expect, it } from "vitest";
import { buildInstallmentShares, scheduleTotal, validateSchedule } from "./schedule";
import type { ScheduleInput } from "./types";

const equal = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  downPayment: 0.1,
  planYears: 8,
  mode: "equal",
  frequency: "yearly",
  ...over,
});

const custom = (yearShares: number[], over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  downPayment: 0.1,
  planYears: yearShares.length,
  mode: "custom",
  yearShares,
  frequency: "yearly",
  ...over,
});

describe("schedule total", () => {
  it("is always exactly 1 in equal mode", () => {
    expect(scheduleTotal(equal())).toBeCloseTo(1, 12);
    expect(scheduleTotal(equal({ downPayment: 0.35, planYears: 3 }))).toBeCloseTo(1, 12);
  });

  it("sums the down payment and every year's share in custom mode", () => {
    expect(scheduleTotal(custom([0.2, 0.3, 0.3]))).toBeCloseTo(0.9, 12);
  });
});

describe("schedule validation", () => {
  it("accepts a custom schedule that totals exactly 100%", () => {
    expect(validateSchedule(custom([0.3, 0.3, 0.3]))).toEqual([]);
  });

  it("rejects a custom schedule that totals less than 100%", () => {
    const errors = validateSchedule(custom([0.2, 0.3, 0.3]));
    expect(errors.some((e) => /100%/.test(e))).toBe(true);
  });

  it("rejects a custom schedule that totals more than 100%", () => {
    const errors = validateSchedule(custom([0.4, 0.3, 0.3]));
    expect(errors.some((e) => /100%/.test(e))).toBe(true);
  });

  it("tolerates floating-point noise in a total that is meant to be 100%", () => {
    // 0.1 + 0.3 + 0.3 + 0.3 is 0.9999999999999999 in IEEE doubles.
    expect(validateSchedule(custom([0.3, 0.3, 0.3]))).toEqual([]);
    expect(validateSchedule(custom([0.15, 0.15, 0.15, 0.15, 0.15, 0.15]))).toEqual([]);
  });

  it("rejects a custom schedule whose year count does not match the plan length", () => {
    const errors = validateSchedule(custom([0.45, 0.45], { planYears: 3 }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects a negative year share", () => {
    const errors = validateSchedule(custom([1.0, -0.1]));
    expect(errors.some((e) => /negative/i.test(e))).toBe(true);
  });

  it("rejects a plan length outside 1–15 years", () => {
    expect(validateSchedule(equal({ planYears: 0 })).length).toBeGreaterThan(0);
    expect(validateSchedule(equal({ planYears: 16 })).length).toBeGreaterThan(0);
    expect(validateSchedule(equal({ planYears: 2.5 })).length).toBeGreaterThan(0);
    expect(validateSchedule(equal({ planYears: 15 }))).toEqual([]);
  });

  it("rejects a down payment outside 0–100%", () => {
    expect(validateSchedule(equal({ downPayment: -0.01 })).length).toBeGreaterThan(0);
    expect(validateSchedule(equal({ downPayment: 1.01 })).length).toBeGreaterThan(0);
    expect(validateSchedule(equal({ downPayment: 1 }))).toEqual([]);
  });
});

describe("installment shares by month", () => {
  it("places equal yearly installments at the end of each year", () => {
    const shares = buildInstallmentShares(equal({ downPayment: 0.1, planYears: 8 }));
    expect(shares.length).toBe(8 * 12 + 1); // index 0 unused, 1..96
    const perYear = 0.9 / 8;
    for (let y = 1; y <= 8; y++) {
      expect(shares[12 * y]).toBeCloseTo(perYear, 12);
    }
    // Nothing is due mid-year on a yearly schedule.
    expect(shares[1]).toBe(0);
    expect(shares[11]).toBe(0);
    expect(shares[13]).toBe(0);
  });

  it("splits a year's share across quarters at months 3, 6, 9 and 12", () => {
    const shares = buildInstallmentShares(custom([0.9], { frequency: "quarterly" }));
    expect(shares[3]).toBeCloseTo(0.225, 12);
    expect(shares[6]).toBeCloseTo(0.225, 12);
    expect(shares[9]).toBeCloseTo(0.225, 12);
    expect(shares[12]).toBeCloseTo(0.225, 12);
    expect(shares[1]).toBe(0);
    expect(shares[4]).toBe(0);
  });

  it("splits a year's share across every month on a monthly schedule", () => {
    const shares = buildInstallmentShares(custom([0.5, 0.4], { frequency: "monthly" }));
    for (let m = 1; m <= 12; m++) expect(shares[m]).toBeCloseTo(0.5 / 12, 12);
    for (let m = 13; m <= 24; m++) expect(shares[m]).toBeCloseTo(0.4 / 12, 12);
  });

  it("uses each year's own share in custom mode", () => {
    const shares = buildInstallmentShares(custom([0.5, 0.3, 0.1]));
    expect(shares[12]).toBeCloseTo(0.5, 12);
    expect(shares[24]).toBeCloseTo(0.3, 12);
    expect(shares[36]).toBeCloseTo(0.1, 12);
  });

  it("sums, with the down payment, to exactly the whole price", () => {
    for (const s of [
      equal({ planYears: 7, frequency: "monthly" }),
      equal({ downPayment: 0.25, planYears: 10, frequency: "quarterly" }),
      custom([0.2, 0.2, 0.2, 0.3], { frequency: "monthly" }),
    ]) {
      const shares = buildInstallmentShares(s);
      const total = shares.reduce((a, b) => a + b, 0) + s.downPayment;
      expect(total).toBeCloseTo(1, 10);
    }
  });
});
