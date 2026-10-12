import { describe, expect, it } from "vitest";
import { REFERENCE } from "./fixtures";
import { durationText, lastInstallmentMonth } from "./schedule";
import { activeLoan, buildDeal, horizonYears, purchaseOf, purchaseProblems } from "./purchase";
import type { CalculatorInputs, LoanInput, PurchaseInput } from "./types";

const LOAN: LoanInput = {
  enabled: true,
  share: 0.9,
  flatRate: 0.12,
  years: 5,
  lendingRatio: 1,
  certificateRate: 0.11,
  release: "at-end",
};
const RESALE: PurchaseInput = {
  kind: "resale",
  discount: 0,
  resaleRemaining: 5_000_000,
  resaleInstallments: 4,
  resaleFrequency: "yearly",
};
const withInputs = (over: Partial<CalculatorInputs>): CalculatorInputs => ({ ...REFERENCE, ...over });
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

describe("purchaseOf / activeLoan", () => {
  it("treats inputs without a purchase as developer installments, and no loan", () => {
    expect(purchaseOf(REFERENCE).kind).toBe("developer-plan");
    expect(activeLoan(REFERENCE)).toBeNull();
  });
  it("ignores a loan that is switched off", () => {
    expect(activeLoan(withInputs({ loan: { ...LOAN, enabled: false } }))).toBeNull();
    expect(activeLoan(withInputs({ loan: LOAN }))).toEqual(LOAN);
  });
});

describe("horizonYears", () => {
  it("is the plan's years with no loan", () => {
    expect(horizonYears(REFERENCE)).toBe(8);
  });
  it("is the longer of the developer stream and the loan", () => {
    expect(horizonYears(withInputs({ loan: { ...LOAN, years: 10 } }))).toBe(10);
    expect(horizonYears(withInputs({ loan: { ...LOAN, years: 3 } }))).toBe(8);
  });
  it("stretches to a later extra cost, and ignores a disabled or invalid one", () => {
    const allNow = withInputs({ schedule: { downPayment: 1, planYears: 1, mode: "equal", frequency: "yearly" } });
    expect(horizonYears(allNow)).toBe(4);
    expect(horizonYears({ ...allNow, finishing: { share: 0.05, year: 6 } })).toBe(6);
    expect(horizonYears({ ...allNow, maintenance: { share: 0, year: 9 } })).toBe(1);
    expect(horizonYears({ ...allNow, maintenance: { share: 0.08, year: Number.NaN } })).toBe(1);
    expect(horizonYears({ ...allNow, maintenance: { share: 0.08, year: 0 } })).toBe(1);
  });
  it("uses the resale's remaining years for a resale", () => {
    expect(horizonYears(withInputs({ purchase: RESALE }))).toBe(4);
    expect(horizonYears(withInputs({ purchase: RESALE, loan: LOAN }))).toBe(5);
  });
});

describe("buildDeal", () => {
  it("developer plan: the down payment up front, the rest of the price on the plan", () => {
    const d = buildDeal(REFERENCE, 8_000_000, 8);
    expect(d.upFront).toBe(800_000);
    expect(sum(d.developerDue)).toBeCloseTo(7_200_000, 6);
    expect(d.developerDue[12]).toBeCloseTo(900_000, 6);
    expect(d.costBase).toBe(8_000_000);
  });
  it("developer plan with a discount: everything scales with the net price", () => {
    const inputs = withInputs({
      purchase: { ...RESALE, kind: "developer-plan", discount: 0.1 },
      schedule: { downPayment: 0.3, planYears: 6, mode: "equal", frequency: "yearly" },
    });
    const d = buildDeal(inputs, 10_000_000, 6);
    expect(d.upFront).toBeCloseTo(2_700_000, 6);
    expect(sum(d.developerDue)).toBeCloseTo(6_300_000, 6);
    for (let m = 12; m <= 72; m += 12) expect(d.developerDue[m]).toBeCloseTo(1_050_000, 6);
    expect(d.costBase).toBeCloseTo(9_000_000, 6);
  });
  it("a 100% down payment is a cash purchase: nothing after, costs on the net price", () => {
    const inputs = withInputs({
      purchase: { ...RESALE, kind: "developer-plan", discount: 0.1 },
      schedule: { downPayment: 1, planYears: 6, mode: "equal", frequency: "yearly" },
    });
    const d = buildDeal(inputs, 10_000_000, 6);
    expect(d.upFront).toBeCloseTo(9_000_000, 6);
    expect(sum(d.developerDue)).toBe(0);
    expect(d.costBase).toBeCloseTo(9_000_000, 6);
  });
  it("resale: the price is the cash to the seller; the remaining balance is fixed and spread over its years", () => {
    const inputs = withInputs({ purchase: RESALE });
    const a = buildDeal(inputs, 10_000_000, 4);
    const b = buildDeal(inputs, 20_000_000, 4);
    expect(a.upFront).toBe(10_000_000);
    expect(sum(a.developerDue)).toBeCloseTo(5_000_000, 6);
    expect(sum(b.developerDue)).toBeCloseTo(5_000_000, 6);
    expect(a.developerDue[12]).toBeCloseTo(1_250_000, 6);
    expect(a.costBase).toBe(15_000_000);
  });
  it("pads the developer stream with zeros out to a longer horizon", () => {
    const d = buildDeal(REFERENCE, 8_000_000, 10);
    expect(d.developerDue).toHaveLength(121);
    expect(d.developerDue[120]).toBe(0);
  });
});

describe("purchaseProblems", () => {
  it("accepts the defaults and a sound resale", () => {
    expect(purchaseProblems(REFERENCE)).toEqual([]);
    expect(purchaseProblems(withInputs({ purchase: RESALE }))).toEqual([]);
  });
  it("rejects a discount of 100% or more, or below 0", () => {
    for (const discount of [1, 1.2, -0.1]) {
      const fields = purchaseProblems(withInputs({ purchase: { ...RESALE, kind: "developer-plan", discount } })).map(
        (p) => p.field,
      );
      expect(fields).toEqual(["purchase.discount"]);
    }
  });
  it("rejects a negative remaining balance and installments outside the range for a resale only for a resale only", () => {
    const fields = purchaseProblems(
      withInputs({ purchase: { ...RESALE, resaleRemaining: -1, resaleInstallments: 61 } }),
    ).map((p) => p.field);
    expect(fields).toEqual(["purchase.resaleRemaining", "purchase.resaleInstallments"]);
    expect(
      purchaseProblems(withInputs({ purchase: { ...RESALE, kind: "developer-plan", resaleInstallments: 0 } })),
    ).toEqual([]);
  });
});

describe("a resale counted in installments", () => {
  const MONTHLY: PurchaseInput = { ...RESALE, resaleRemaining: 3_100_000, resaleInstallments: 31, resaleFrequency: "monthly" };
  it("31 monthly installments land 100,000 on months 1 to 31 and nothing at 32", () => {
    const inputs = withInputs({ purchase: MONTHLY });
    const deal = buildDeal(inputs, 1_000_000, horizonYears(inputs));
    for (let m = 1; m <= 31; m++) expect(deal.developerDue[m]).toBeCloseTo(100_000, 6);
    expect(deal.developerDue[32]).toBe(0);
  });
  it("the developer stream spans ceil(months / 12) years", () => {
    const inputs = withInputs({ purchase: MONTHLY, schedule: { ...REFERENCE.schedule, planYears: 1 }, maintenance: { share: 0, year: 1 } });
    expect(horizonYears(inputs)).toBe(3);
  });
  it("bounds the count by 15 years of payments at the frequency", () => {
    const bad = (n: number, f: PurchaseInput["resaleFrequency"]) =>
      purchaseProblems(withInputs({ purchase: { ...RESALE, resaleInstallments: n, resaleFrequency: f } }));
    expect(bad(0, "quarterly")).toHaveLength(1);
    expect(bad(61, "quarterly")).toHaveLength(1);
    expect(bad(2.5, "quarterly")).toHaveLength(1);
    expect(bad(60, "quarterly")).toEqual([]);
    expect(bad(61, "quarterly")[0].message).toBe("Installments left must be a whole number from 1 to 60.");
  });
  it("names the last installment's month and the span in words", () => {
    expect(lastInstallmentMonth(31, "monthly")).toBe(31);
    expect(lastInstallmentMonth(4, "quarterly")).toBe(12);
    expect(lastInstallmentMonth(3, "yearly")).toBe(36);
    expect(durationText(7)).toBe("7 months");
    expect(durationText(12)).toBe("1 year");
    expect(durationText(48)).toBe("4 years");
    expect(durationText(31)).toBe("2 years 7 months");
    expect(durationText(13)).toBe("1 year 1 month");
  });
});
