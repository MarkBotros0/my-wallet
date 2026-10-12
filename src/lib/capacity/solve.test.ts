import { describe, expect, it } from "vitest";
import { REFERENCE } from "./fixtures";
import { simulate, validateInputs } from "./simulate";
import {
  bestPlan,
  commonHorizon,
  compare,
  compareTopUp,
  maxFeasiblePrice,
  minTopUp,
  sensitivity,
  solvePlans,
  topUpSensitivity,
  withoutLoan,
} from "./solve";
import type { CalculatorInputs, LoanInput, PlanResult, PurchaseInput } from "./types";

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

describe("maxFeasiblePrice — monotonic for every kind, loan on and off", () => {
  const LOAN: LoanInput = {
    enabled: true, share: 0.9, flatRate: 0.12, years: 5, lendingRatio: 1, certificateRate: 0.11, release: "gradual",
  };
  const purchases: PurchaseInput[] = [
    { kind: "developer-plan", discount: 0, resaleRemaining: 0, resaleYears: 1, resaleFrequency: "yearly" },
    { kind: "developer-plan", discount: 0.25, resaleRemaining: 0, resaleYears: 1, resaleFrequency: "yearly" },
    { kind: "resale", discount: 0, resaleRemaining: 2_000_000, resaleYears: 4, resaleFrequency: "quarterly" },
  ];
  for (const purchase of purchases) {
    for (const loan of [undefined, LOAN]) {
      it(`${purchase.kind} (discount ${purchase.discount}), ${loan ? "with" : "without"} a loan`, () => {
        const inputs = withInputs({
          purchase,
          loan,
          income: { amount: 40_000, frequency: "monthly", annualIncrease: 0.05 },
        });
        const { maxPrice } = maxFeasiblePrice(inputs);
        expect(maxPrice).not.toBeNull();
        for (const k of [1, 10, 100, 1_000]) {
          const below = maxPrice! - k * 1_000;
          if (below >= 0) expect(simulate(inputs, below).feasible, `${below} feasible`).toBe(true);
          expect(simulate(inputs, maxPrice! + k * 1_000).feasible, `${maxPrice! + k * 1_000} infeasible`).toBe(false);
        }
      });
    }
  }
});

describe("withoutLoan / compare", () => {
  const LOAN: LoanInput = {
    enabled: true, share: 1, flatRate: 0.1, years: 10, lendingRatio: 1, certificateRate: 0.15, release: "at-end",
  };
  const CASH: PurchaseInput = {
    kind: "developer-plan", discount: 0.3, resaleRemaining: 0, resaleYears: 1, resaleFrequency: "yearly",
  };

  it("only turns the loan off", () => {
    const base = withoutLoan(withInputs({ purchase: CASH, loan: LOAN }));
    expect(base.loan?.enabled ?? false).toBe(false);
    expect(base.purchase).toEqual(CASH);
    const resale = withoutLoan(withInputs({ purchase: { ...CASH, kind: "resale", resaleYears: 3 }, loan: LOAN }));
    expect(resale.purchase!.kind).toBe("resale");
  });

  it("measures both sides over the deal's horizon, so the endings share a date", () => {
    const c = compare(withInputs({ purchase: CASH, loan: LOAN }), 5_000_000);
    expect(c.horizonYears).toBe(10);
    expect(c.tested!.withLoan.monthly).toHaveLength(121);
    expect(c.tested!.withoutLoan.monthly).toHaveLength(121);
    expect(c.withoutLoan.simulation!.horizonYears).toBe(10);
  });

  it("solves both maxima; the with-loan side equals solving the deal on its own", () => {
    const inputs = withInputs({ purchase: CASH, loan: LOAN });
    const c = compare(inputs);
    expect(c.withLoan.maxPrice).toBe(maxFeasiblePrice(inputs).maxPrice);
    expect(c.withoutLoan.maxPrice).toBe(maxFeasiblePrice(withoutLoan(inputs), undefined, 10).maxPrice);
    expect(c.tested).toBeNull();
  });
});

describe("minTopUp", () => {
  it("is 0 when the price already works", () => {
    const r = minTopUp(REFERENCE, 8_000_000);
    expect(r).toMatchObject({ topUp: 0, blocker: null });
    expect(r.simulation.feasible).toBe(true);
  });
  it("finds the least top-up on the step grid", () => {
    const inputs = withInputs({ income: { amount: 0, frequency: "yearly", annualIncrease: 0 } });
    const r = minTopUp(inputs, 8_860_000);
    expect(r.topUp).not.toBeNull();
    const t = r.topUp!;
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThanOrEqual(300_000);
    expect(t % 1000).toBe(0);
    expect(simulate({ ...inputs, topUp: t }, 8_860_000).feasible).toBe(true);
    expect(simulate({ ...inputs, topUp: t - 1000 }, 8_860_000).feasible).toBe(false);
    expect(r.simulation.topUp).toBe(t);
  });
  it('blocks "day-one" when the up-front payment needs more than the savings', () => {
    const r = minTopUp(
      withInputs({ schedule: { downPayment: 0.6, planYears: 8, mode: "equal", frequency: "yearly" } }),
      10_000_000,
    );
    expect(r.topUp).toBeNull();
    expect(r.blocker).toBe("day-one");
    expect(r.simulation.topUp).toBe(0);
  });
  it('blocks "too-early" when a payment falls due before the first top-up arrives', () => {
    const r = minTopUp(
      withInputs({
        schedule: { downPayment: 0, planYears: 8, mode: "equal", frequency: "monthly" },
        safetyBuffer: 4_999_999,
      }),
      9_600_000,
    );
    expect(r.topUp).toBeNull();
    expect(r.blocker).toBe("too-early");
  });
  it("is monotonic in price", () => {
    const inputs = withInputs({ income: { amount: 0, frequency: "yearly", annualIncrease: 0 } });
    const tops = [8_000_000, 8_500_000, 9_000_000, 9_500_000, 10_000_000].map((p) => minTopUp(inputs, p).topUp);
    expect(tops.every((t) => t !== null)).toBe(true);
    for (let i = 1; i < tops.length; i++) expect(tops[i - 1]!).toBeLessThanOrEqual(tops[i]!);
  });
});

describe("solvePlans / bestPlan", () => {
  const cash = withInputs({
    schedule: { downPayment: 1, planYears: 8, mode: "equal", frequency: "yearly" },
    purchase: { kind: "developer-plan", discount: 0.25, resaleRemaining: 0, resaleYears: 1, resaleFrequency: "yearly" },
  });
  const short = withInputs({ schedule: { downPayment: 1, planYears: 1, mode: "equal", frequency: "yearly" } });
  const plans = [REFERENCE, cash, short];

  it("solves every plan over one horizon", () => {
    expect(commonHorizon(plans)).toBe(8);
    const rs = solvePlans(plans, { mode: "max" });
    for (const r of rs) expect(r.simulation!.horizonYears).toBe(8);
    plans.forEach((plan, i) => expect(rs[i].price).toBe(maxFeasiblePrice(plan, 1000, 8).maxPrice));
    expect(rs[0].price).toBe(8_860_000);
    expect(rs[0].topUp).toBeNull();
  });
  it("top-up mode returns each plan's minimum top-up for the price asked", () => {
    const poor = plans.map((p) => ({ ...p, income: { amount: 0, frequency: "yearly" as const, annualIncrease: 0 } }));
    const rs = solvePlans(poor, { mode: "topUp", prices: [9_000_000, 9_000_000, 9_000_000] });
    poor.forEach((plan, i) => {
      const expected = minTopUp(plan, 9_000_000, 1000, 8);
      expect(rs[i]).toMatchObject({ price: 9_000_000, topUp: expected.topUp, blocker: expected.blocker });
      expect(rs[i].simulation!.horizonYears).toBe(8);
    });
  });
  it("a plan without a price is not solved", () => {
    const rs = solvePlans([REFERENCE, cash], { mode: "topUp", prices: [9_000_000] });
    expect(rs[1].price).toBeNull();
    expect(rs[1].simulation).toBeNull();
    expect(rs[1].topUp).toBeNull();
  });
  it("bestPlan: highest price or lowest top-up, first on a tie, nulls never", () => {
    const r = (price: number | null, topUp: number | null = null): PlanResult => ({
      price, topUp, blocker: null, simulation: null,
    });
    expect(bestPlan([r(5), r(9), r(9), r(null)], "max")).toBe(1);
    expect(bestPlan([r(9, null), r(9, 200), r(9, 100), r(9, 100)], "topUp")).toBe(2);
    expect(bestPlan([r(null), r(null)], "max")).toBeNull();
    expect(bestPlan([r(9, null)], "topUp")).toBeNull();
    expect(bestPlan([], "max")).toBeNull();
  });
});

describe("topUpSensitivity / compareTopUp / horizon params", () => {
  const poor = withInputs({ income: { amount: 0, frequency: "yearly", annualIncrease: 0 } });
  it("reports a top-up per rate, falling as the rate rises", () => {
    const rows = topUpSensitivity(poor, 8_860_000);
    expect(rows.map((r) => r.delta)).toEqual([-0.06, -0.03, 0, 0.03]);
    expect(rows.every((r) => r.topUp !== null)).toBe(true);
    const tops = rows.map((r) => r.topUp!);
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeLessThanOrEqual(tops[i - 1]);
  });
  it("sensitivity accepts a longer horizon", () => {
    expect(sensitivity(REFERENCE, [0], 1000, 8)[0].maxPrice).toBe(8_860_000);
    expect(sensitivity(REFERENCE, [0], 1000, 10)[0].maxPrice).not.toBeNull();
  });
  it("compare takes a horizon; compareTopUp solves both sides over one", () => {
    expect(compare(REFERENCE, null, 1000, 10).horizonYears).toBe(10);
    const c = compareTopUp(poor, 8_860_000, 1000, 10);
    expect(c.horizonYears).toBe(10);
    expect(c.withLoan.simulation.horizonYears).toBe(10);
    expect(c.withoutLoan.simulation.horizonYears).toBe(10);
  });
});
