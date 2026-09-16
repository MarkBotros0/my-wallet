import { describe, expect, it } from "vitest";
import { REFERENCE } from "./fixtures";
import { simulate, validateInputs } from "./simulate";
import { maxFeasiblePrice, sensitivity } from "./solve";
import type { CalculatorInputs } from "./types";

const withInputs = (over: Partial<CalculatorInputs>): CalculatorInputs => ({ ...REFERENCE, ...over });

describe("maxFeasiblePrice", () => {
  it("reproduces the reference scenario: ≈ 8,860,000", () => {
    // capital 5,000,000 · 12% effective · 8 years · 10% down · equal yearly
    // installments at year end · maintenance 8% in year 4 · 300,000 yearly
    // income at year end · buffer 500,000. Every cash flow here lands at a
    // year end, so the monthly engine agrees with yearly compounding steps
    // exactly, not just within the ±3% the spec allows.
    const { maxPrice, simulation } = maxFeasiblePrice(REFERENCE);
    expect(maxPrice).toBe(8_860_000);
    expect(simulation?.feasible).toBe(true);
    expect(simulation?.price).toBe(8_860_000);
    expect(Math.abs((maxPrice! - 8_860_000) / 8_860_000)).toBeLessThan(0.03);
  });

  it("returns the largest multiple of the step that is feasible", () => {
    const { maxPrice } = maxFeasiblePrice(REFERENCE, 1_000);
    expect(maxPrice! % 1_000).toBe(0);
    expect(simulate(REFERENCE, maxPrice!).feasible).toBe(true);
    expect(simulate(REFERENCE, maxPrice! + 1_000).feasible).toBe(false);
  });

  it("is monotonic: every price below the maximum is feasible, every price above is not", () => {
    const inputs = withInputs({
      schedule: { downPayment: 0.15, planYears: 10, mode: "equal", frequency: "monthly" },
      income: { amount: 25_000, frequency: "monthly", annualIncrease: 0.05 },
      maintenance: { share: 0.08, year: 3 },
      finishing: { share: 0.1, year: 5 },
    });
    const { maxPrice } = maxFeasiblePrice(inputs);
    expect(maxPrice).not.toBeNull();
    for (const lower of [1, 2, 5, 10, 50, 500, 2_000, 5_000]) {
      const p = maxPrice! - lower * 1_000;
      if (p < 0) continue;
      expect(simulate(inputs, p).feasible, `price ${p} should be feasible`).toBe(true);
    }
    for (const higher of [1, 2, 10, 100, 10_000]) {
      const p = maxPrice! + higher * 1_000;
      expect(simulate(inputs, p).feasible, `price ${p} should be infeasible`).toBe(false);
    }
  });

  it("with zero return and zero income, a 100% down payment can spend capital minus buffer", () => {
    const inputs = withInputs({
      effectiveAnnualRate: 0,
      schedule: { downPayment: 1, planYears: 5, mode: "equal", frequency: "yearly" },
      income: { amount: 0, frequency: "yearly", annualIncrease: 0 },
      maintenance: { share: 0, year: 1 },
      finishing: { share: 0, year: 1 },
      safetyBuffer: 500_000,
    });
    expect(maxFeasiblePrice(inputs).maxPrice).toBe(4_500_000);
  });

  it("reports nothing affordable when the capital is already below the buffer", () => {
    const { maxPrice, simulation } = maxFeasiblePrice(withInputs({ startingCapital: 400_000 }));
    expect(maxPrice).toBeNull();
    expect(simulation).toBeNull();
  });

  it("reports nothing affordable when even one step of price breaches the buffer", () => {
    // Capital exactly at the buffer: price 0 is fine, price 1,000 is not.
    const inputs = withInputs({
      effectiveAnnualRate: 0,
      income: { amount: 0, frequency: "yearly", annualIncrease: 0 },
      startingCapital: 500_000,
    });
    expect(maxFeasiblePrice(inputs).maxPrice).toBeNull();
  });

  it("can afford more than the starting capital when returns and income carry the installments", () => {
    expect(maxFeasiblePrice(REFERENCE).maxPrice!).toBeGreaterThan(REFERENCE.startingCapital);
  });
});

describe("sensitivity", () => {
  it("solves at −6, −3, 0 and +3 points around the current rate, in that order", () => {
    const rows = sensitivity(REFERENCE);
    expect(rows.map((r) => r.delta)).toEqual([-0.06, -0.03, 0, 0.03]);
    expect(rows.map((r) => r.effectiveAnnualRate)).toEqual(
      [0.06, 0.09, 0.12, 0.15].map((v) => expect.closeTo(v, 12)),
    );
    expect(rows[2].maxPrice).toBe(8_860_000);
  });

  it("affords more at higher returns", () => {
    const prices = sensitivity(REFERENCE).map((r) => r.maxPrice!);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThan(prices[i - 1]);
    }
  });

  it("never solves at a negative rate", () => {
    const rows = sensitivity(withInputs({ effectiveAnnualRate: 0.02 }));
    expect(rows[0].effectiveAnnualRate).toBe(0);
    expect(rows[1].effectiveAnnualRate).toBe(0);
    expect(rows[0].maxPrice).toBe(rows[1].maxPrice);
  });
});

describe("end-of-plan keep target", () => {
  it("reports how much was paid into the property and how much stayed in the fund", () => {
    const r = simulate(REFERENCE, 8_000_000);
    expect(r.paidIntoProperty).toBeCloseTo(8_000_000 + 640_000, 6); // price + 8% maintenance
    expect(r.keptInFund).toBe(r.finalBalance);
    expect(r.keptShareOfCapital).toBeCloseTo(r.finalBalance / REFERENCE.startingCapital, 12);
  });

  it("lowers the maximum price when the user wants to keep part of their capital", () => {
    const base = maxFeasiblePrice(REFERENCE).maxPrice!;
    const keep30 = maxFeasiblePrice(withInputs({ minKeptShare: 0.3 })).maxPrice!;
    expect(keep30).toBeLessThan(base);
    const sim = simulate(withInputs({ minKeptShare: 0.3 }), keep30);
    expect(sim.finalBalance).toBeGreaterThanOrEqual(0.3 * REFERENCE.startingCapital);
    expect(simulate(withInputs({ minKeptShare: 0.3 }), keep30 + 1_000).feasible).toBe(false);
  });

  it("marks a plan infeasible on the end target alone, without a buffer breach", () => {
    // At 8,500,000 the balance never nears the 500,000 buffer (it ends ≈1.13M)
    // but that is below the 1,500,000 the user wants to keep.
    const r = simulate(withInputs({ minKeptShare: 0.3 }), 8_500_000);
    expect(r.minBalance).toBeGreaterThan(REFERENCE.safetyBuffer);
    expect(r.firstBreach).toBeNull();
    expect(r.feasible).toBe(false);
    expect(r.endShortfall).not.toBeNull();
    expect(r.endShortfall!.target).toBeCloseTo(1_500_000, 6);
    expect(r.endShortfall!.shortfall).toBeCloseTo(1_500_000 - r.finalBalance, 6);
  });

  it("treats a 0% keep target as no requirement", () => {
    expect(maxFeasiblePrice(withInputs({ minKeptShare: 0 })).maxPrice).toBe(8_860_000);
    expect(simulate(REFERENCE, 8_000_000).endShortfall).toBeNull();
  });

  it("rejects a keep target outside 0–100%", () => {
    expect(validateInputs(withInputs({ minKeptShare: 1.2 })).length).toBeGreaterThan(0);
    expect(validateInputs(withInputs({ minKeptShare: -0.1 })).length).toBeGreaterThan(0);
  });
});
