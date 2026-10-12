import { describe, expect, it } from "vitest";
import { decliningRateFromFlat, loanProblems, loanTerms, pledgeHeld } from "./loan";
import type { LoanInput } from "./types";

const LOAN: LoanInput = {
  enabled: true,
  share: 0.9,
  flatRate: 0.12,
  years: 5,
  lendingRatio: 1,
  certificateRate: 0.11,
  release: "at-end",
};

describe("loanTerms — flat rate", () => {
  it("borrows a share of the up-front payment and charges flat interest on all of it every year", () => {
    const t = loanTerms(LOAN, 10_000_000);
    expect(t.amount).toBe(9_000_000);
    expect(t.months).toBe(60);
    expect(t.totalInterest).toBeCloseTo(5_400_000, 6);
    expect(t.monthlyInstallment).toBeCloseTo(240_000, 6);
  });
  it("pledges the loan divided by the lending ratio", () => {
    expect(loanTerms(LOAN, 10_000_000).pledge).toBe(9_000_000);
    expect(loanTerms({ ...LOAN, lendingRatio: 0.9 }, 10_000_000).pledge).toBeCloseTo(10_000_000, 6);
  });
});

describe("decliningRateFromFlat", () => {
  it("is 0 for a 0% loan", () => {
    expect(decliningRateFromFlat(0, 5)).toBe(0);
  });
  it("finds the nominal rate whose annuity has the same installment (12% flat, 5 years ≈ 20.3%)", () => {
    const r = decliningRateFromFlat(0.12, 5);
    expect(r).toBeCloseTo(0.2031, 3);
    const i = r / 12;
    const annuity = i / (1 - Math.pow(1 + i, -60));
    expect(annuity).toBeCloseTo((1 + 0.12 * 5) / 60, 8);
  });
  it("is carried on the terms", () => {
    expect(loanTerms(LOAN, 1).equivalentDecliningRate).toBeCloseTo(decliningRateFromFlat(0.12, 5), 10);
  });
});

describe("pledgeHeld", () => {
  const t = loanTerms(LOAN, 10_000_000);
  it("at-end: the whole pledge until the last installment, then nothing", () => {
    expect(pledgeHeld(t, "at-end", 0)).toBe(9_000_000);
    expect(pledgeHeld(t, "at-end", 59)).toBe(9_000_000);
    expect(pledgeHeld(t, "at-end", 60)).toBe(0);
    expect(pledgeHeld(t, "at-end", 70)).toBe(0);
  });
  it("gradual: remaining principal ÷ ratio — flat loans repay principal in equal parts", () => {
    expect(pledgeHeld(t, "gradual", 30)).toBeCloseTo(4_500_000, 6);
    expect(pledgeHeld(t, "gradual", 60)).toBe(0);
    const t2 = loanTerms({ ...LOAN, lendingRatio: 0.5 }, 10_000_000);
    expect(pledgeHeld(t2, "gradual", 15)).toBeCloseTo(18_000_000 * 0.75, 6);
  });
});

describe("loanProblems", () => {
  it("has nothing to say about an absent or switched-off loan", () => {
    expect(loanProblems(undefined)).toEqual([]);
    expect(loanProblems({ ...LOAN, enabled: false, years: 0 })).toEqual([]);
  });
  it("names each bad field", () => {
    const fields = loanProblems({
      ...LOAN,
      share: 1.5,
      flatRate: -0.01,
      years: 2.5,
      lendingRatio: 0,
      certificateRate: 2,
    }).map((p) => p.field);
    expect(fields).toEqual(["loan.share", "loan.flatRate", "loan.years", "loan.lendingRatio", "loan.certificateRate"]);
  });
  it("says what most banks lend when the lending ratio is out of range", () => {
    const [p] = loanProblems({ ...LOAN, lendingRatio: 1.2 });
    expect(p.message).toMatch(/90–100%/);
  });
});
