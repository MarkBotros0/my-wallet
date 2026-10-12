import { describe, expect, it } from "vitest";
import { monthlyRate } from "./rates";
import { REFERENCE } from "./fixtures";
import { inputProblems, simulate, validateInputs } from "./simulate";
import { maxFeasiblePrice } from "./solve";
import type { CalculatorInputs, LoanInput, PurchaseInput } from "./types";

const withInputs = (over: Partial<CalculatorInputs>): CalculatorInputs => ({ ...REFERENCE, ...over });

const NO_PAYMENTS: CalculatorInputs = withInputs({
  effectiveAnnualRate: 0,
  schedule: { downPayment: 1, planYears: 2, mode: "equal", frequency: "yearly" },
  income: { amount: 0, frequency: "yearly", annualIncrease: 0 },
  maintenance: { share: 0, year: 1 },
  safetyBuffer: 0,
});

describe("simulate — month 0", () => {
  it("starts with capital minus the down payment, with no flows of its own", () => {
    const r = simulate(REFERENCE, 8_000_000);
    expect(r.downPayment).toBe(800_000);
    expect(r.monthly[0]).toEqual({
      month: 0,
      balance: 4_200_000,
      returns: 0,
      income: 0,
      installment: 0,
      extraCost: 0,
      certificateInterest: 0,
      bankInstallment: 0,
      released: 0,
      held: 0,
    });
  });

  it("carries each month's flows on its point, reconciling to the balance and the year rows", () => {
    const r = simulate(REFERENCE, 8_000_000);
    for (let m = 1; m < r.monthly.length; m++) {
      const p = r.monthly[m];
      const prev = r.monthly[m - 1].balance;
      expect(p.balance).toBeCloseTo(
        prev + p.returns + p.certificateInterest + p.income - p.installment - p.extraCost - p.bankInstallment + p.released,
        6,
      );
    }
    for (const y of r.years) {
      const months = r.monthly.filter((p) => p.month > (y.year - 1) * 12 && p.month <= y.year * 12);
      const sum = (k: "returns" | "income" | "installment" | "extraCost") => months.reduce((a, p) => a + p[k], 0);
      expect(sum("returns")).toBeCloseTo(y.returns, 6);
      expect(sum("income")).toBeCloseTo(y.income, 6);
      expect(sum("installment")).toBeCloseTo(y.installments, 6);
      expect(sum("extraCost")).toBeCloseTo(y.extraCosts, 6);
    }
    // The reference plan pays yearly at year ends and maintenance at the end of year 4.
    expect(r.monthly[11].installment).toBe(0);
    expect(r.monthly[12].installment).toBeCloseTo(900_000, 6);
    expect(r.monthly[48].extraCost).toBeCloseTo(640_000, 6);
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
  it("opens year 1 on the starting capital and chains each closing into the next opening", () => {
    const r = simulate(withInputs({ schedule: { ...REFERENCE.schedule, frequency: "monthly" } }), 8_000_000);
    expect(r.years).toHaveLength(8);
    expect(r.years[0].opening).toBe(REFERENCE.startingCapital);
    expect(r.years[0].opening - r.years[0].downPayment).toBe(r.monthly[0].balance);
    for (let i = 1; i < r.years.length; i++) {
      expect(r.years[i].opening).toBe(r.years[i - 1].closing);
    }
    expect(r.years[7].closing).toBe(r.finalBalance);
  });

  it("puts the down payment on year 1 only", () => {
    const r = simulate(REFERENCE, 8_000_000);
    expect(r.years[0].downPayment).toBe(r.downPayment);
    expect(r.years.slice(1).every((y) => y.downPayment === 0)).toBe(true);
  });

  it("balances every row: opening + returns + income − down payment − installments − extra costs = closing", () => {
    const r = simulate(withInputs({ schedule: { ...REFERENCE.schedule, frequency: "quarterly" } }), 8_000_000);
    for (const y of r.years) {
      expect(y.opening + y.returns + y.income - y.downPayment - y.installments - y.extraCosts).toBeCloseTo(
        y.closing,
        6,
      );
      expect(y.lowest).toBeLessThanOrEqual(y.closing + 1e-9);
    }
  });

  it("flags year 1 when the down payment alone drops the fund below the buffer", () => {
    // 60% down on 1,000,000 leaves 400,000 at month 0, under the 500,000
    // buffer; 200,000 a month of income lifts every later month back above
    // it, so the only breach is the one right after the down payment.
    const r = simulate(
      withInputs({
        startingCapital: 1_000_000,
        safetyBuffer: 500_000,
        schedule: { downPayment: 0.6, planYears: 2, mode: "equal", frequency: "yearly" },
        income: { amount: 200_000, frequency: "monthly", annualIncrease: 0 },
        maintenance: { share: 0, year: 1 },
        finishing: { share: 0, year: 1 },
      }),
      1_000_000,
    );
    expect(r.monthly[0].balance).toBe(400_000);
    expect(r.monthly.slice(1).every((p) => p.balance >= 500_000)).toBe(true);
    expect(r.years[0].lowest).toBe(400_000);
    expect(r.years[0].breached).toBe(true);
    expect(r.years[1].breached).toBe(false);
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

  it("rejects an income increase above 100% a year", () => {
    expect(validateInputs(withInputs({ income: { amount: 1, frequency: "yearly", annualIncrease: 1.01 } })).length).toBeGreaterThan(0);
    expect(validateInputs(withInputs({ income: { amount: 1, frequency: "yearly", annualIncrease: 1 } }))).toEqual([]);
  });

  it("names the input each problem is about", () => {
    const fieldsOf = (over: Partial<CalculatorInputs>) => inputProblems(withInputs(over)).map((p) => p.field);
    expect(fieldsOf({ startingCapital: 0 })).toEqual(["startingCapital"]);
    expect(fieldsOf({ effectiveAnnualRate: 1.01 })).toEqual(["effectiveAnnualRate"]);
    expect(fieldsOf({ safetyBuffer: -1 })).toEqual(["safetyBuffer"]);
    expect(fieldsOf({ returnFee: 1.5 })).toEqual(["returnFee"]);
    expect(fieldsOf({ minKeptShare: 1.2 })).toEqual(["minKeptShare"]);
    expect(fieldsOf({ income: { amount: -1, frequency: "yearly", annualIncrease: 2 } })).toEqual([
      "income.amount",
      "income.annualIncrease",
    ]);
    expect(fieldsOf({ maintenance: { share: 0.08, year: 9 } })).toEqual(["maintenance.year"]);
    expect(fieldsOf({ finishing: { share: 1.5, year: 1 } })).toEqual(["finishing.share"]);
    const shares = [0.5, 0.5, 0, 0, 0, 0, 0, 0]; // 110% with the down payment
    expect(
      fieldsOf({ schedule: { downPayment: 0.1, planYears: 8, mode: "custom", yearShares: shares, frequency: "yearly" } }),
    ).toEqual(["schedule.yearShares"]);
  });

  it("keeps validateInputs as the messages of inputProblems", () => {
    const bad = withInputs({ startingCapital: -5, safetyBuffer: -1 });
    expect(validateInputs(bad)).toEqual(inputProblems(bad).map((p) => p.message));
  });
});

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
  cashDiscount: 0,
  resaleRemaining: 5_000_000,
  resaleYears: 4,
  resaleFrequency: "yearly",
};
/** Savings large enough to carry the resale example: 10M to the seller, 9M of it borrowed. */
const RESALE_DEAL = withInputs({
  startingCapital: 20_000_000,
  purchase: RESALE,
  loan: LOAN,
  maintenance: { share: 0, year: 1 },
});

describe("simulate — the reference survives the generalisation", () => {
  it("still solves to 8,860,000 and ends at 500,991 with no purchase and no loan given", () => {
    const { maxPrice, simulation } = maxFeasiblePrice(REFERENCE);
    expect(maxPrice).toBe(8_860_000);
    expect(Math.round(simulation!.finalBalance)).toBe(500_991);
    expect(simulation!.loan).toBeNull();
    expect(simulation!.upFront).toBe(simulation!.downPayment);
    expect(simulation!.upFrontFromFund).toBe(simulation!.downPayment);
  });
});

describe("simulate — with a loan against certificates", () => {
  it("month 0: the fund pays its share of the up-front payment and locks the pledge", () => {
    const r = simulate(RESALE_DEAL, 10_000_000);
    expect(r.upFront).toBe(10_000_000);
    expect(r.upFrontFromFund).toBeCloseTo(1_000_000, 6);
    expect(r.monthly[0].held).toBe(9_000_000);
    expect(r.monthly[0].balance).toBeCloseTo(20_000_000 - 1_000_000 - 9_000_000, 6);
  });

  it("pays rate/12 on the pledge every month and the bank installment for the loan's months", () => {
    const r = simulate(RESALE_DEAL, 10_000_000);
    expect(r.monthly[1].certificateInterest).toBeCloseTo(82_500, 6);
    expect(r.monthly[1].bankInstallment).toBeCloseTo(240_000, 6);
    expect(r.monthly[60].bankInstallment).toBeCloseTo(240_000, 6);
    expect(r.loan!.totalInterest).toBeCloseTo(5_400_000, 6);
    expect(r.loan!.certificateInterest).toBeCloseTo(82_500 * 60, 4);
    expect(r.loan!.netCost).toBeCloseTo(5_400_000 - 4_950_000, 4);
  });

  it("at-end release: the whole pledge comes back on the last installment", () => {
    const r = simulate(RESALE_DEAL, 10_000_000);
    expect(r.monthly[59].held).toBe(9_000_000);
    expect(r.monthly[60].released).toBe(9_000_000);
    expect(r.monthly[60].held).toBe(0);
  });

  it("gradual release: the pledge follows the remaining principal down", () => {
    const r = simulate(withInputs({ ...RESALE_DEAL, loan: { ...LOAN, release: "gradual" } }), 10_000_000);
    expect(r.monthly[30].held).toBeCloseTo(4_500_000, 6);
    expect(r.monthly[1].released).toBeCloseTo(150_000, 6);
    expect(r.monthly[60].held).toBe(0);
  });

  it("runs to the longer of the developer stream and the loan", () => {
    const r = simulate(RESALE_DEAL, 10_000_000);
    expect(r.horizonYears).toBe(5);
    expect(r.monthly).toHaveLength(61);
    expect(r.monthly[60].installment).toBe(0); // the resale's 4 years are over
    expect(r.monthly[48].installment).toBeCloseTo(1_250_000, 6);
  });

  it("checks the buffer against the spendable fund only", () => {
    // 20M savings, 9M locked, 1M paid: 10M spendable at month 0. A 12M buffer
    // is under spendable + held (19M) but over spendable alone.
    const r = simulate(withInputs({ ...RESALE_DEAL, safetyBuffer: 12_000_000 }), 10_000_000);
    expect(r.feasible).toBe(false);
    expect(r.firstBreach!.month).toBe(0);
  });

  it("is infeasible at month 0 when the pledge plus the fund's share exceeds the savings", () => {
    const r = simulate(
      withInputs({ ...RESALE_DEAL, startingCapital: 8_000_000, safetyBuffer: 0, loan: { ...LOAN, share: 1, lendingRatio: 0.9 } }),
      10_000_000,
    );
    expect(r.feasible).toBe(false);
    expect(r.firstBreach!.month).toBe(0);
  });

  it("a free loan is a 0% installment plan: spendable + held follows the plan's balance", () => {
    const rate = monthlyRate(0.12) * 12;
    const base = withInputs({
      startingCapital: 20_000_000,
      maintenance: { share: 0, year: 1 },
      income: { amount: 0, frequency: "yearly", annualIncrease: 0 },
      safetyBuffer: 0,
      schedule: { downPayment: 0, planYears: 5, mode: "equal", frequency: "monthly" },
    });
    const withLoan = simulate(
      {
        ...base,
        purchase: { ...RESALE, kind: "developer-cash", cashDiscount: 0 },
        loan: { ...LOAN, share: 1, flatRate: 0, certificateRate: rate },
      },
      10_000_000,
    );
    const plan = simulate(base, 10_000_000);
    for (let m = 0; m <= 60; m++) {
      const p = withLoan.monthly[m];
      expect(p.balance + p.held).toBeCloseTo(plan.monthly[m].balance, 2);
    }
  });

  it("reconciles every year row with a loan on", () => {
    for (const release of ["at-end", "gradual"] as const) {
      const r = simulate(withInputs({ ...RESALE_DEAL, loan: { ...LOAN, release } }), 10_000_000);
      for (const y of r.years) {
        expect(y.closing).toBeCloseTo(
          y.opening + y.returns + y.certificateInterest + y.income + y.released
            - y.downPayment - y.pledged - y.installments - y.bankInstallments - y.extraCosts,
          4,
        );
      }
      expect(r.years[0].pledged).toBe(9_000_000);
      expect(r.years[1].pledged).toBe(0);
    }
  });

  it("puts extra costs on the cash price for a developer cash purchase, and on cash + remaining for a resale", () => {
    const cash = simulate(
      withInputs({
        startingCapital: 20_000_000,
        purchase: { ...RESALE, kind: "developer-cash", cashDiscount: 0.3 },
        maintenance: { share: 0.1, year: 1 },
      }),
      10_000_000,
    );
    expect(cash.monthly[12].extraCost).toBeCloseTo(700_000, 6);
    const resale = simulate(withInputs({ ...RESALE_DEAL, maintenance: { share: 0.1, year: 1 } }), 10_000_000);
    expect(resale.monthly[12].extraCost).toBeCloseTo(1_500_000, 6);
  });
});

describe("inputProblems — purchase and loan", () => {
  it("passes a sound resale with a loan", () => {
    expect(inputProblems(RESALE_DEAL)).toEqual([]);
  });
  it("ignores the hidden developer plan for a resale", () => {
    const fields = inputProblems(
      withInputs({ ...RESALE_DEAL, schedule: { downPayment: 0.1, planYears: 99, mode: "equal", frequency: "yearly" } }),
    ).map((p) => p.field);
    expect(fields).toEqual([]);
  });
  it("allows an extra cost in any year up to the horizon", () => {
    const inputs = withInputs({ loan: { ...LOAN, years: 10 }, maintenance: { share: 0.08, year: 10 } });
    expect(inputProblems(inputs)).toEqual([]);
    const late = withInputs({ loan: { ...LOAN, years: 10 }, maintenance: { share: 0.08, year: 11 } });
    expect(inputProblems(late).map((p) => p.field)).toEqual(["maintenance.year"]);
  });
  it("reports loan and purchase problems with their fields", () => {
    const fields = inputProblems(
      withInputs({ ...RESALE_DEAL, purchase: { ...RESALE, resaleYears: 0 }, loan: { ...LOAN, lendingRatio: 0 } }),
    ).map((p) => p.field);
    expect(fields).toContain("purchase.resaleYears");
    expect(fields).toContain("loan.lendingRatio");
  });
});
