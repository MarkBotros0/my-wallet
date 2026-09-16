import { describe, expect, it } from "vitest";
import { monthlyRate } from "./rates";
import { REFERENCE } from "./fixtures";
import { simulate, validateInputs } from "./simulate";
import type { CalculatorInputs } from "./types";

const withInputs = (over: Partial<CalculatorInputs>): CalculatorInputs => ({ ...REFERENCE, ...over });

const NO_PAYMENTS: CalculatorInputs = withInputs({
  effectiveAnnualRate: 0,
  schedule: { downPayment: 1, planYears: 2, mode: "equal", frequency: "yearly" },
  income: { amount: 0, frequency: "yearly", annualIncrease: 0 },
  maintenance: { share: 0, year: 1 },
  safetyBuffer: 0,
});

describe("simulate — month 0", () => {
  it("starts with capital minus the down payment", () => {
    const r = simulate(REFERENCE, 8_000_000);
    expect(r.downPayment).toBe(800_000);
    expect(r.monthly[0]).toEqual({ month: 0, balance: 4_200_000 });
  });

  it("is infeasible when the down payment exceeds the capital", () => {
    const r = simulate(REFERENCE, 60_000_000); // 10% down = 6,000,000 > 5,000,000
    expect(r.feasible).toBe(false);
    expect(r.firstBreach?.month).toBe(0);
  });

  it("reports installments as everything owed after the down payment", () => {
    const r = simulate(REFERENCE, 8_000_000);
    expect(r.totalInstallments).toBeCloseTo(7_200_000, 6);
    expect(r.totalExtraCosts).toBeCloseTo(640_000, 6); // 8% maintenance
  });
});

describe("simulate — cash-flow timing", () => {
  it("adds monthly income every month, growing by the annual increase each year", () => {
    const r = simulate(
      withInputs({
        ...NO_PAYMENTS,
        startingCapital: 1_000_000,
        income: { amount: 1_000, frequency: "monthly", annualIncrease: 0.1 },
      }),
      0,
    );
    expect(r.years[0].income).toBeCloseTo(12_000, 6);
    expect(r.years[1].income).toBeCloseTo(13_200, 6);
    expect(r.finalBalance).toBeCloseTo(1_025_200, 6);
    // Month 1 already carries the first payment; month 0 does not.
    expect(r.monthly[1].balance).toBeCloseTo(1_001_000, 6);
  });

  it("adds yearly income at the end of each year only", () => {
    const r = simulate(
      withInputs({
        ...NO_PAYMENTS,
        startingCapital: 1_000_000,
        schedule: { ...NO_PAYMENTS.schedule, planYears: 3 },
        income: { amount: 100_000, frequency: "yearly", annualIncrease: 0.1 },
      }),
      0,
    );
    expect(r.monthly[11].balance).toBeCloseTo(1_000_000, 6);
    expect(r.monthly[12].balance).toBeCloseTo(1_100_000, 6);
    expect(r.years.map((y) => y.income)).toEqual([100_000, 110_000, 121_000].map((v) => expect.closeTo(v, 6)));
  });

  it("charges extra costs at the end of their year", () => {
    const r = simulate(
      withInputs({
        ...NO_PAYMENTS,
        startingCapital: 1_000_000,
        schedule: { downPayment: 0, planYears: 3, mode: "custom", yearShares: [0, 0, 1], frequency: "yearly" },
        maintenance: { share: 0.1, year: 2 },
        finishing: { share: 0.05, year: 1 },
      }),
      100_000,
    );
    expect(r.years[0].extraCosts).toBeCloseTo(5_000, 6);
    expect(r.years[1].extraCosts).toBeCloseTo(10_000, 6);
    expect(r.years[2].extraCosts).toBe(0);
    expect(r.monthly[23].balance).toBeCloseTo(995_000, 6); // finishing paid, maintenance not yet
    expect(r.monthly[24].balance).toBeCloseTo(985_000, 6);
  });

  it("applies growth, then income, then payments within a month", () => {
    // 1,000 at 0% → month 1: growth 0, +100 income, −50 installment (monthly, 1 year, 600 total).
    const r = simulate(
      withInputs({
        startingCapital: 1_000,
        effectiveAnnualRate: 0,
        schedule: { downPayment: 0, planYears: 1, mode: "equal", frequency: "monthly" },
        income: { amount: 100, frequency: "monthly", annualIncrease: 0 },
        maintenance: { share: 0, year: 1 },
        safetyBuffer: 0,
      }),
      600,
    );
    expect(r.monthly[1].balance).toBeCloseTo(1_050, 9);
    expect(r.finalBalance).toBeCloseTo(1_000 + 1_200 - 600, 9);
  });
});

describe("simulate — returns", () => {
  it("compounds the monthly rate back to the effective annual yield", () => {
    const r = simulate(
      withInputs({ ...NO_PAYMENTS, startingCapital: 1_000_000, effectiveAnnualRate: 0.12 }),
      0,
    );
    expect(r.years[0].returns).toBeCloseTo(120_000, 4);
    expect(r.years[0].closing).toBeCloseTo(1_120_000, 4);
  });

  it("deducts the fee from each month's return", () => {
    const r = simulate(
      withInputs({ ...NO_PAYMENTS, startingCapital: 1_000_000, effectiveAnnualRate: 0.12, returnFee: 0.5 }),
      0,
    );
    const netMonthly = monthlyRate(0.12) * 0.5;
    expect(r.years[0].returns).toBeCloseTo(1_000_000 * (Math.pow(1 + netMonthly, 12) - 1), 4);
  });

  it("works at a 0% return", () => {
    const r = simulate(withInputs({ effectiveAnnualRate: 0 }), 4_000_000);
    expect(r.years.every((y) => y.returns === 0)).toBe(true);
    expect(Number.isFinite(r.finalBalance)).toBe(true);
  });

  it("earns nothing on a negative balance", () => {
    const r = simulate(
      withInputs({
        ...NO_PAYMENTS,
        startingCapital: 100_000,
        effectiveAnnualRate: 0.12,
        schedule: { downPayment: 1, planYears: 1, mode: "equal", frequency: "yearly" },
      }),
      1_000_000,
    );
    expect(r.monthly[0].balance).toBe(-900_000);
    expect(r.years[0].returns).toBe(0);
    expect(r.finalBalance).toBe(-900_000);
  });
});

describe("simulate — feasibility and breaches", () => {
  it("is feasible when the balance never drops below the buffer", () => {
    const r = simulate(REFERENCE, 8_000_000);
    expect(r.feasible).toBe(true);
    expect(r.firstBreach).toBeNull();
    expect(r.minBalance).toBeGreaterThanOrEqual(REFERENCE.safetyBuffer);
  });

  it("reports the first breach month and the shortfall for a price that is too high", () => {
    const r = simulate(REFERENCE, 12_000_000);
    expect(r.feasible).toBe(false);
    expect(r.firstBreach).not.toBeNull();
    const { month, shortfall } = r.firstBreach!;
    expect(month % 12).toBe(0); // only year-end cash flows in this scenario
    expect(shortfall).toBeGreaterThan(0);
    expect(r.monthly[month].balance).toBeCloseTo(REFERENCE.safetyBuffer - shortfall, 6);
    // Nothing before that month was below the buffer.
    for (let m = 0; m < month; m++) {
      expect(r.monthly[m].balance).toBeGreaterThanOrEqual(REFERENCE.safetyBuffer);
    }
  });

  it("flags exactly the years whose lowest balance is below the buffer", () => {
    const r = simulate(REFERENCE, 12_000_000);
    for (const y of r.years) {
      expect(y.breached).toBe(y.lowest < REFERENCE.safetyBuffer);
    }
    expect(r.years.some((y) => y.breached)).toBe(true);
  });
});

describe("simulate — year table", () => {
  it("chains each year's closing balance into the next year's opening", () => {
    const r = simulate(withInputs({ schedule: { ...REFERENCE.schedule, frequency: "monthly" } }), 8_000_000);
    expect(r.years).toHaveLength(8);
    expect(r.years[0].opening).toBe(r.monthly[0].balance);
    for (let i = 1; i < r.years.length; i++) {
      expect(r.years[i].opening).toBe(r.years[i - 1].closing);
    }
    expect(r.years[7].closing).toBe(r.finalBalance);
  });

  it("balances every row: opening + returns + income − installments − extra costs = closing", () => {
    const r = simulate(withInputs({ schedule: { ...REFERENCE.schedule, frequency: "quarterly" } }), 8_000_000);
    for (const y of r.years) {
      expect(y.opening + y.returns + y.income - y.installments - y.extraCosts).toBeCloseTo(y.closing, 6);
      expect(y.lowest).toBeLessThanOrEqual(y.closing + 1e-9);
    }
  });

  it("sums installments across years to the total owed after the down payment", () => {
    const r = simulate(withInputs({ schedule: { ...REFERENCE.schedule, frequency: "monthly" } }), 8_000_000);
    const paid = r.years.reduce((a, y) => a + y.installments, 0);
    expect(paid).toBeCloseTo(r.totalInstallments, 6);
    expect(paid).toBeCloseTo(8_000_000 * 0.9, 6);
  });
});

describe("validateInputs", () => {
  it("accepts the reference scenario", () => {
    expect(validateInputs(REFERENCE)).toEqual([]);
  });

  it("rejects a return rate outside 0–100%", () => {
    expect(validateInputs(withInputs({ effectiveAnnualRate: -0.01 })).length).toBeGreaterThan(0);
    expect(validateInputs(withInputs({ effectiveAnnualRate: 1.01 })).length).toBeGreaterThan(0);
    expect(validateInputs(withInputs({ effectiveAnnualRate: 1 }))).toEqual([]);
  });

  it("rejects an extra cost due outside the plan", () => {
    expect(validateInputs(withInputs({ maintenance: { share: 0.08, year: 9 } })).length).toBeGreaterThan(0);
    // A disabled cost (share 0) does not care about its year.
    expect(validateInputs(withInputs({ finishing: { share: 0, year: 99 } }))).toEqual([]);
  });

  it("rejects a negative buffer, a non-positive capital and an out-of-range fee", () => {
    expect(validateInputs(withInputs({ safetyBuffer: -1 })).length).toBeGreaterThan(0);
    expect(validateInputs(withInputs({ startingCapital: 0 })).length).toBeGreaterThan(0);
    expect(validateInputs(withInputs({ returnFee: 1.5 })).length).toBeGreaterThan(0);
  });

  it("surfaces schedule errors too", () => {
    const bad = withInputs({
      schedule: { downPayment: 0.1, planYears: 2, mode: "custom", yearShares: [0.5, 0.5], frequency: "yearly" },
    });
    expect(validateInputs(bad).some((e) => /100%/.test(e))).toBe(true);
  });
});
