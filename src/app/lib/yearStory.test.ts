import { describe, expect, it } from "vitest";
import { REFERENCE } from "@/lib/capacity/fixtures";
import { simulate, type CalculatorInputs } from "@/lib/capacity";
import { yearStory } from "./yearStory";

const WITH_LOAN: CalculatorInputs = {
  ...REFERENCE,
  startingCapital: 20_000_000,
  maintenance: { share: 0, year: 1 },
  purchase: { kind: "resale", cashDiscount: 0, resaleRemaining: 5_000_000, resaleYears: 4, resaleFrequency: "yearly" },
  loan: { enabled: true, share: 0.9, flatRate: 0.12, years: 5, lendingRatio: 1, certificateRate: 0.11, release: "gradual" },
};

describe("yearStory", () => {
  for (const [name, inputs, price] of [
    ["a plain developer plan", REFERENCE, 8_000_000],
    ["a resale with a gradual-release loan", WITH_LOAN, 10_000_000],
  ] as const) {
    it(`makes Opening, the groups and Closing add up for ${name}`, () => {
      const sim = simulate(inputs, price);
      for (const y of sim.years) {
        const { paid, fromSavings } = yearStory(y);
        expect(y.opening - fromSavings - y.pledged + y.released).toBeCloseTo(y.closing, 4);
        expect(paid).toBeCloseTo(y.downPayment + y.installments + y.extraCosts + y.bankInstallments, 6);
      }
    });
  }

  it("counts the bank installments as paid", () => {
    const y = simulate(WITH_LOAN, 10_000_000).years[0];
    expect(y.bankInstallments).toBeGreaterThan(0);
    expect(yearStory(y).paid).toBeGreaterThan(y.downPayment + y.installments + y.extraCosts);
  });
});
