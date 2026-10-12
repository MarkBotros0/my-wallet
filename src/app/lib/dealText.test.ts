import { describe, expect, it } from "vitest";
import { REFERENCE } from "@/lib/capacity/fixtures";
import { DEFAULT_STEP, simulate, type CalculatorInputs, type Comparison, type SimulationResult, type TopUpResult } from "@/lib/capacity";
import { describeDeal, loanVerdict, loanVerdictTopUp, topUpSentence, type DealSentence } from "./dealText";

const RESALE_DEAL: CalculatorInputs = {
  ...REFERENCE,
  startingCapital: 20_000_000,
  maintenance: { share: 0, year: 1 },
  purchase: { kind: "resale", discount: 0, resaleRemaining: 5_000_000, resaleInstallments: 4, resaleFrequency: "yearly" },
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
    expect(text(sentences[2])).toBe("Then you pay the bank # a month for 5 years, and the developer # at the end of each year — 4 payments, the last in 4 years.");
    expect(amounts(sentences[2])).toEqual([
      { amount: 240_000, tone: "out" },
      { amount: 1_250_000, tone: "out" },
    ]);
  });

  it("describes the plain developer plan without a bank", () => {
    const s = describeDeal(REFERENCE, simulate(REFERENCE, 8_000_000));
    expect(text(s[0])).toBe("You pay the developer # today (10% of the price), from savings.");
    expect(text(s[1])).toBe("Then you pay the developer # at the end of each year for 8 years.");
    expect(amounts(s[1])).toEqual([{ amount: 900_000, tone: "out" }]);
    expect(text(s[2])).toBe("Plus # in extra costs.");
  });

  it("says the whole price after the discount for a 100% payment now", () => {
    const d: CalculatorInputs = {
      ...REFERENCE,
      maintenance: { share: 0, year: 1 },
      schedule: { downPayment: 1, planYears: 8, mode: "equal", frequency: "yearly" },
      purchase: { kind: "developer-plan", discount: 0.25, resaleRemaining: 0, resaleInstallments: 1, resaleFrequency: "yearly" },
    };
    const s = describeDeal(d, simulate(d, 5_000_000));
    expect(text(s[0])).toBe("You pay the developer # today (the whole price after 25% off), from savings.");
    expect(text(s[s.length - 1])).toBe("Nothing is left to pay after that.");
  });

  it("says how much is paid now, after a discount, or without one", () => {
    const p = (discount: number) => ({ kind: "developer-plan" as const, discount, resaleRemaining: 0, resaleInstallments: 1, resaleFrequency: "yearly" as const });
    const a = { ...REFERENCE, schedule: { ...REFERENCE.schedule, downPayment: 0.3 }, purchase: p(0.1) };
    expect(text(describeDeal(a, simulate(a, 5_000_000))[0])).toBe("You pay the developer # today (30% of the price after 10% off), from savings.");
    expect(text(describeDeal(REFERENCE, simulate(REFERENCE, 8_000_000))[0])).toBe("You pay the developer # today (10% of the price), from savings.");
  });

  it("puts the bank's part in a developer plan's first sentence", () => {
    const l = { ...RESALE_DEAL, purchase: { ...RESALE_DEAL.purchase!, kind: "developer-plan" as const } };
    expect(text(describeDeal(l, simulate(l, 10_000_000))[0])).toBe("You pay the developer # today (10% of the price) — # from the bank, # from savings.");
  });

  it("says the bank pays it all instead of '0 from savings'", () => {
    const all = { ...RESALE_DEAL, loan: { ...RESALE_DEAL.loan!, share: 1 } };
    const sim = simulate(all, 10_000_000);
    expect(sim.upFrontFromFund).toBeLessThan(0.5);
    const first = describeDeal(all, sim)[0];
    expect(text(first)).toBe("You pay the seller # today — all of it from the bank.");
    expect(amounts(first)).toEqual([{ amount: 10_000_000, tone: "out" }]);
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
});

describe("topUpSentence", () => {
  const base = simulate(REFERENCE, 8_000_000);
  const r = (topUp: number | null, blocker: TopUpResult["blocker"] = null, sim: SimulationResult = base): TopUpResult => ({ topUp, simulation: sim, blocker });

  it("says no top-up is needed at 0", () => {
    expect(text(topUpSentence(r(0), "yearly"))).toBe("Your savings and income already carry this plan — no top-up needed.");
  });
  it("gives a yearly amount, and the monthly part only for monthly income", () => {
    expect(text(topUpSentence(r(240_000), "yearly"))).toBe("Add # a year on top of your income.");
    const m = topUpSentence(r(240_000), "monthly");
    expect(text(m)).toBe("Add # a year on top of your income (#/month).");
    expect(amounts(m)).toEqual([{ amount: 240_000, tone: "in" }, { amount: 20_000, tone: "in" }]);
  });
  it("mentions the raise when income grows", () => {
    expect(text(topUpSentence(r(240_000), "yearly", 0.05))).toBe("Add # a year on top of your income, growing with your raise.");
  });
  it("explains a day-one blocker with the shortfall", () => {
    const sim = { ...base, firstBreach: { month: 0, shortfall: 750_000 } };
    const s = topUpSentence(r(null, "day-one", sim), "yearly");
    expect(text(s)).toBe("No top-up can fix this: on day one you need # more savings than you have.");
    expect(amounts(s)).toEqual([{ amount: 750_000, tone: "neutral" }]);
  });
  it("explains a too-early blocker with the month", () => {
    const sim = { ...base, firstBreach: { month: 6, shortfall: 1 } };
    expect(text(topUpSentence(r(null, "too-early", sim), "yearly"))).toBe(
      "No top-up can fix this: a payment in month 6 comes before the first top-up arrives.",
    );
  });
});

describe("loanVerdictTopUp", () => {
  const sim = simulate(RESALE_DEAL, 10_000_000);
  const r = (topUp: number | null): TopUpResult => ({ topUp, simulation: sim, blocker: null });
  const v = (a: number | null, b: number | null) => loanVerdictTopUp({ withLoan: r(a), withoutLoan: r(b) });

  it("says you'd add more without the loan", () => {
    const x = v(100_000, 400_000);
    expect(x.kind).toBe("loan-better");
    expect(x.difference).toBe(300_000);
    expect(text(x.headline)).toBe("Without the loan you'd add # a year more.");
    expect(amounts(x.headline)).toEqual([{ amount: 300_000, tone: "neutral" }]);
    expect(x.interest).toBeCloseTo(5_400_000, 4);
  });
  it("says you'd add less without the loan", () => {
    const x = v(400_000, 100_000);
    expect(x.kind).toBe("no-loan-better");
    expect(text(x.headline)).toBe("Without the loan you'd add # a year less.");
    expect(amounts(x.headline)).toEqual([{ amount: 300_000, tone: "neutral" }]);
  });
  it("calls top-ups within one solver step the same, and further apart different", () => {
    expect(v(100_000, 100_000 - DEFAULT_STEP).kind).toBe("same");
    expect(v(100_000, 100_000 - DEFAULT_STEP - 1).kind).not.toBe("same");
  });
  it("calls equal top-ups the same", () => {
    expect(v(100_000, 100_000).kind).toBe("same");
  });
  it("handles blocked sides", () => {
    expect(text(v(100_000, null).headline)).toBe("Without the loan no top-up can make this work.");
    expect(v(100_000, null).kind).toBe("loan-better");
    expect(v(null, 100_000).kind).toBe("no-loan-better");
    expect(v(null, null).kind).toBe("neither");
  });
});
