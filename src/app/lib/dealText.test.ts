import { describe, expect, it } from "vitest";
import { REFERENCE } from "@/lib/capacity/fixtures";
import { simulate, type CalculatorInputs, type Comparison, type SimulationResult } from "@/lib/capacity";
import { describeDeal, loanVerdict, type DealSentence } from "./dealText";

const RESALE_DEAL: CalculatorInputs = {
  ...REFERENCE,
  startingCapital: 20_000_000,
  maintenance: { share: 0, year: 1 },
  purchase: { kind: "resale", cashDiscount: 0, resaleRemaining: 5_000_000, resaleYears: 4, resaleFrequency: "yearly" },
  loan: { enabled: true, share: 0.9, flatRate: 0.12, years: 5, lendingRatio: 1, certificateRate: 0.11, release: "at-end" },
};

const amounts = (s: DealSentence) =>
  s.flatMap((p) => (typeof p === "string" ? [] : [{ amount: Math.round(p.amount), tone: p.tone }]));
const text = (s: DealSentence) => s.map((p) => (typeof p === "string" ? p : "#")).join("");

describe("describeDeal", () => {
  const sentences = describeDeal(RESALE_DEAL, simulate(RESALE_DEAL, 10_000_000));

  it("says who is paid up front, and how much comes from the bank and from savings", () => {
    expect(text(sentences[0])).toBe("You pay the seller # today — # from the bank, # from savings.");
    expect(amounts(sentences[0])).toEqual([
      { amount: 10_000_000, tone: "out" },
      { amount: 9_000_000, tone: "in" },
      { amount: 1_000_000, tone: "out" },
    ]);
  });

  it("says what is locked, what it earns and when it comes back", () => {
    expect(text(sentences[1])).toBe("# of savings is locked as the bank's guarantee, earning # a month; it all comes back after 5 years.");
    expect(amounts(sentences[1])).toEqual([
      { amount: 9_000_000, tone: "held" },
      { amount: 82_500, tone: "in" },
    ]);
  });

  it("lists what is paid after, to the bank and to the developer", () => {
    expect(text(sentences[2])).toBe("Then you pay the bank # a month for 5 years, and the developer # at the end of each year for 4 years.");
    expect(amounts(sentences[2])).toEqual([
      { amount: 240_000, tone: "out" },
      { amount: 1_250_000, tone: "out" },
    ]);
  });

  it("describes the plain developer plan without a bank", () => {
    const s = describeDeal(REFERENCE, simulate(REFERENCE, 8_000_000));
    expect(text(s[0])).toBe("You pay the developer # today as the down payment, from savings.");
    expect(text(s[1])).toBe("Then you pay the developer # at the end of each year for 8 years.");
    expect(amounts(s[1])).toEqual([{ amount: 900_000, tone: "out" }]);
    expect(text(s[2])).toBe("Plus # in extra costs.");
  });

  it("says nothing is left for a cash purchase with no loan", () => {
    const cash: CalculatorInputs = {
      ...REFERENCE,
      maintenance: { share: 0, year: 1 },
      purchase: { kind: "developer-cash", cashDiscount: 0.2, resaleRemaining: 0, resaleYears: 1, resaleFrequency: "yearly" },
    };
    const s = describeDeal(cash, simulate(cash, 5_000_000));
    expect(text(s[0])).toBe("You pay the developer # today — the cash price — from savings.");
    expect(text(s[s.length - 1])).toBe("Nothing is left to pay after that.");
  });

  it("says the pledge comes back bit by bit on a gradual release", () => {
    const g = { ...RESALE_DEAL, loan: { ...RESALE_DEAL.loan!, release: "gradual" as const } };
    expect(text(describeDeal(g, simulate(g, 10_000_000))[1])).toMatch(/comes back bit by bit as you repay, over 5 years\.$/);
  });
});

describe("loanVerdict", () => {
  const sim = simulate(RESALE_DEAL, 10_000_000);
  const result = (maxPrice: number | null, s: SimulationResult | null = sim) => ({ maxPrice, simulation: s });
  const comparison = (a: number | null, b: number | null): Comparison => ({
    horizonYears: 5,
    withLoan: result(a),
    withoutLoan: result(b, null),
    tested: null,
  });

  it("says the loan is better by the difference in maxima", () => {
    const v = loanVerdict(RESALE_DEAL, comparison(11_200_000, 10_000_000));
    expect(v.kind).toBe("loan-better");
    expect(v.difference).toBe(1_200_000);
    expect(v.interest).toBeCloseTo(5_400_000, 4);
    expect(v.certificateInterest).toBeCloseTo(4_950_000, 4);
    expect(v.discountSaved).toBe(0);
  });
  it("says no loan is better when its maximum is higher", () => {
    expect(loanVerdict(RESALE_DEAL, comparison(9_600_000, 10_000_000)).kind).toBe("no-loan-better");
  });
  it("calls it the same within one solver step", () => {
    expect(loanVerdict(RESALE_DEAL, comparison(10_001_000, 10_000_000)).kind).toBe("same");
  });
  it("treats an unaffordable side as 0, and both unaffordable as neither", () => {
    expect(loanVerdict(RESALE_DEAL, comparison(3_000_000, null)).kind).toBe("loan-better");
    expect(loanVerdict(RESALE_DEAL, comparison(null, null)).kind).toBe("neither");
  });
  it("counts the cash discount saved at the with-loan maximum for a cash purchase", () => {
    const cash = { ...RESALE_DEAL, purchase: { ...RESALE_DEAL.purchase!, kind: "developer-cash" as const, cashDiscount: 0.3 } };
    expect(loanVerdict(cash, comparison(10_000_000, 8_000_000)).discountSaved).toBeCloseTo(3_000_000, 6);
  });
});
