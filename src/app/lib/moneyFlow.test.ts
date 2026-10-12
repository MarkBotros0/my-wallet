import { describe, expect, it } from "vitest";
import { REFERENCE } from "@/lib/capacity/fixtures";
import { simulate, type CalculatorInputs, type LoanInput } from "@/lib/capacity";
import { dealBreakdown, flowGroups } from "./moneyFlow";

const LOAN: LoanInput = { enabled: true, share: 0.9, flatRate: 0.12, years: 5, lendingRatio: 1, certificateRate: 0.11, release: "at-end" };
const rich = (over: Partial<CalculatorInputs>): CalculatorInputs => ({ ...REFERENCE, startingCapital: 30_000_000, ...over });
const cases: [string, CalculatorInputs, number][] = [
  ["the reference", REFERENCE, 8_860_000],
  ["plan + loan at-end", rich({ loan: LOAN }), 8_000_000],
  ["plan + loan gradual", rich({ loan: { ...LOAN, release: "gradual" } }), 8_000_000],
  [
    "resale + loan",
    rich({ purchase: { kind: "resale", discount: 0, resaleRemaining: 5_000_000, resaleYears: 4, resaleFrequency: "quarterly" }, loan: LOAN }),
    10_000_000,
  ],
  [
    "100% now with a discount",
    rich({
      schedule: { downPayment: 1, planYears: 8, mode: "equal", frequency: "yearly" },
      purchase: { kind: "developer-plan", discount: 0.25, resaleRemaining: 0, resaleYears: 1, resaleFrequency: "yearly" },
    }),
    10_000_000,
  ],
  ["a top-up on monthly income", rich({ topUp: 200_000, income: { amount: 20_000, frequency: "monthly", annualIncrease: 0.05 } }), 8_000_000],
];

describe("dealBreakdown", () => {
  for (const [name, inputs, price] of cases) {
    it(`${name}: start + subtotals = end`, () => {
      const sim = simulate(inputs, price);
      const b = dealBreakdown(inputs, sim);
      const sum = b.groups.reduce((s, g) => s + g.subtotal, b.start);
      expect(Math.abs(sum - b.end)).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(b.end)));
      expect(b.groups[0].id).toBe("savings");
      expect(b.groups[0].rows[0]).toMatchObject({ key: "start", label: "You start with", tone: "neutral", amount: sim.startingCapital });
      for (const g of b.groups) {
        expect(g.rows.some((r) => r.key !== "start" && r.amount === 0)).toBe(false);
        expect(g.subtotal).toBeCloseTo(g.rows.filter((r) => r.key !== "start").reduce((s, r) => s + r.amount, 0), 6);
      }
    });
  }

  it("reads a plain developer plan as savings, income, developer, costs", () => {
    const b = dealBreakdown(REFERENCE, simulate(REFERENCE, 8_860_000));
    expect(b.groups.map((g) => [g.id, g.title])).toEqual([
      ["savings", "Your savings"],
      ["added", "What you add"],
      ["developer", "Developer"],
      ["costs", "Extra costs"],
    ]);
    expect(b.groups[2].rows.map((r) => r.label)).toEqual(["Paid now", "Installments"]);
    expect(b.groups[2].rows.every((r) => r.amount < 0 && r.tone === "out")).toBe(true);
  });

  it("labels the bank group and the resale rows", () => {
    const [, inputs, price] = cases[3];
    const b = dealBreakdown(inputs, simulate(inputs, price));
    const dev = b.groups.find((g) => g.id === "developer")!;
    expect(dev.title).toBe("Seller and developer");
    expect(dev.rows.map((r) => r.label)).toEqual(["Cash to the seller", "Developer installments"]);
    const bank = b.groups.find((g) => g.id === "bank")!;
    expect(bank.title).toBe("Bank loan");
    expect(bank.rows.map((r) => [r.label, r.tone, Math.sign(r.amount)])).toEqual([
      ["Loan received", "in", 1],
      ["Bank installments", "out", -1],
      ["Locked as guarantee", "held", -1],
      ["Guarantee returned", "held", 1],
      ["Interest on the guarantee", "in", 1],
    ]);
  });

  it("names the savings returns after the vehicle, and lists a top-up", () => {
    const [, inputs, price] = cases[5];
    const cert = { ...inputs, savingsVehicle: "certificate" as const };
    const b = dealBreakdown(cert, simulate(cert, price));
    expect(b.groups[0].rows.map((r) => r.label)).toEqual(["You start with", "Certificate interest"]);
    expect(b.groups[1].rows.map((r) => r.label)).toEqual(["Income", "Yearly top-up"]);
  });
});

describe("flowGroups", () => {
  it("works on a year row, with no start row and no empty groups", () => {
    const y = simulate(REFERENCE, 8_860_000).years[0];
    const g = flowGroups(y, { vehicle: "fund", kind: "developer-plan", hasLoan: false });
    expect(g.flatMap((x) => x.rows).some((r) => r.key === "start")).toBe(false);
    expect(g.map((x) => x.id)).toEqual(["savings", "added", "developer"]);
    const sum = g.reduce((s, x) => s + x.subtotal, y.opening);
    expect(sum).toBeCloseTo(y.closing, 4);
  });
});

describe("flowGroups per year, with loans", () => {
  const RESALE = { kind: "resale" as const, discount: 0, resaleRemaining: 5_000_000, resaleYears: 4, resaleFrequency: "quarterly" as const };
  const yearCases: [string, CalculatorInputs, number][] = [
    ["resale + gradual release", rich({ purchase: RESALE, loan: { ...LOAN, release: "gradual" } }), 10_000_000],
    ["developer + at-end, lending ratio 0.9", rich({ loan: { ...LOAN, lendingRatio: 0.9 } }), 8_000_000],
  ];
  for (const [name, inputs, price] of yearCases) {
    it(`${name}: opening + subtotals = closing, every year`, () => {
      const sim = simulate(inputs, price);
      const ctx = { vehicle: "fund" as const, kind: inputs.purchase?.kind ?? ("developer-plan" as const), hasLoan: true };
      expect(sim.years.length).toBeGreaterThan(1);
      for (const y of sim.years) {
        const sum = flowGroups(y, ctx).reduce((s, g) => s + g.subtotal, y.opening);
        expect(Math.abs(sum - y.closing)).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(y.closing)));
      }
    });
  }
});

describe("group tone", () => {
  it("follows only the money that moved: a returned guarantee never turns the bank group green", () => {
    const inputs = rich({ loan: LOAN });
    const sim = simulate(inputs, 8_000_000);
    const back = sim.years.find((y) => y.released > 0)!;
    const bank = flowGroups(back, { vehicle: "fund", kind: "developer-plan", hasLoan: true }).find((g) => g.id === "bank")!;
    const real = bank.rows.filter((r) => r.tone !== "held").reduce((s, r) => s + r.amount, 0);
    // The guarantee coming back outweighs the year's installments, so the full net is positive…
    expect(bank.subtotal).toBeGreaterThan(0);
    expect(real).toBeLessThan(0);
    // …but the colour follows the bank installments and the interest only.
    expect(bank.tone).toBe("out");
  });

  it("is neutral when only held money moved, and follows the sign otherwise", () => {
    const g = flowGroups(
      { returns: 0, certificateInterest: 0, income: 0, topUp: 0, loanReceived: 0, released: 1_000, upFront: 0, pledged: 0, installments: 0, bankInstallments: 0, extraCosts: 0 },
      { vehicle: "fund", kind: "developer-plan", hasLoan: true },
    );
    expect(g.map((x) => [x.id, x.tone])).toEqual([["bank", "neutral"]]);
    const y = simulate(REFERENCE, 8_860_000).years[0];
    const tones = Object.fromEntries(flowGroups(y, { vehicle: "fund", kind: "developer-plan", hasLoan: false }).map((x) => [x.id, x.tone]));
    expect(tones).toMatchObject({ savings: "in", developer: "out" });
  });
});
