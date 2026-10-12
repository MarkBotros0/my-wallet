import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, normalizeForm, parseForm, resizeYearPcts, type CapacityForm } from "./capacityForm";

const form = (over: Partial<CapacityForm> = {}): CapacityForm => ({ ...DEFAULT_FORM, ...over });

describe("parseForm", () => {
  it("turns the reference scenario's fields into engine inputs", () => {
    const { inputs, errors } = parseForm(
      form({
        startingCapital: "5,000,000",
        rateMode: "effective",
        effectiveRatePct: "12",
        planYears: "8",
        scheduleMode: "equal",
        downPaymentPct: "10",
        frequency: "yearly",
        incomeAmount: "300000",
        incomeFrequency: "yearly",
        incomeIncreasePct: "0",
        maintenancePct: "8",
        maintenanceYear: "4",
        finishingPct: "",
        safetyBuffer: "500 000",
        returnFeePct: "",
        keepPct: "",
      }),
    );
    expect(errors).toEqual([]);
    expect(inputs).toEqual({
      startingCapital: 5_000_000,
      effectiveAnnualRate: 0.12,
      schedule: { downPayment: 0.1, planYears: 8, mode: "equal", frequency: "yearly" },
      income: { amount: 300_000, frequency: "yearly", annualIncrease: 0 },
      maintenance: { share: 0.08, year: 4 },
      finishing: { share: 0, year: 1 },
      safetyBuffer: 500_000,
      returnFee: 0,
      minKeptShare: 0,
      purchase: { kind: "developer-plan", cashDiscount: 0, resaleRemaining: 0, resaleYears: 1, resaleFrequency: "yearly" },
    });
  });

  it("converts a nominal rate and compounding into the effective rate the engine uses", () => {
    const { inputs, errors } = parseForm(form({ rateMode: "nominal", nominalRatePct: "18.51", compounding: "365" }));
    expect(errors).toEqual([]);
    expect(inputs!.effectiveAnnualRate).toBeCloseTo(0.2033, 4);
  });

  it("passes custom year shares through as fractions", () => {
    const { inputs, errors } = parseForm(
      form({ planYears: "3", scheduleMode: "custom", downPaymentPct: "10", yearPcts: ["30", "30", "30"] }),
    );
    expect(errors).toEqual([]);
    expect(inputs!.schedule).toEqual({
      downPayment: 0.1,
      planYears: 3,
      mode: "custom",
      yearShares: [0.3, 0.3, 0.3],
      frequency: "yearly",
    });
  });

  it("reports a custom schedule that does not total 100% against the year fields", () => {
    const { inputs, errors } = parseForm(
      form({ planYears: "2", scheduleMode: "custom", downPaymentPct: "10", yearPcts: ["50", "50"] }),
    );
    expect(inputs).toBeNull();
    expect(errors.some((e) => e.field === "yearPcts" && /100%/.test(e.message))).toBe(true);
  });

  it("names the field when a required number is missing or malformed", () => {
    const { inputs, errors, byField } = parseForm(form({ startingCapital: "", effectiveRatePct: "abc" }));
    expect(inputs).toBeNull();
    expect(errors).toEqual([
      { field: "startingCapital", message: expect.stringMatching(/starting capital.*required/i) },
      { field: "effectiveRatePct", message: expect.stringMatching(/return rate.*number/i) },
    ]);
    expect(byField.startingCapital).toMatch(/required/i);
    expect(byField.effectiveRatePct).toMatch(/number/i);
  });

  it("maps the engine's problems onto the form's fields", () => {
    expect(parseForm(form({ keepPct: "120" })).errors.map((e) => e.field)).toEqual(["keepPct"]);
    expect(parseForm(form({ incomeIncreasePct: "150" })).errors.map((e) => e.field)).toEqual(["incomeIncreasePct"]);
    expect(parseForm(form({ maintenancePct: "8", maintenanceYear: "9" })).errors.map((e) => e.field)).toEqual([
      "maintenanceYear",
    ]);
  });

  it("points a return-rate problem at the rate field in use, restated for a nominal entry", () => {
    expect(parseForm(form({ effectiveRatePct: "120" })).errors.map((e) => e.field)).toEqual(["effectiveRatePct"]);
    // 80% nominal compounded daily is ~122% effective — the user typed 80, so say what it became.
    const { errors } = parseForm(form({ rateMode: "nominal", nominalRatePct: "80", compounding: "365" }));
    expect(errors).toEqual([{ field: "nominalRatePct", message: expect.stringMatching(/effective.*122\.\d+%/i) }]);
  });

  it("lists blocking errors in the order the fields appear on the page", () => {
    // The engine reports the buffer before the fee on returns; the page shows
    // the fee first, then the "what must stay in the fund" card, then the plan.
    const { errors } = parseForm(form({ safetyBuffer: "-1", keepPct: "120", returnFeePct: "150", downPaymentPct: "150" }));
    expect(errors.map((e) => e.field)).toEqual(["returnFeePct", "safetyBuffer", "keepPct", "downPaymentPct"]);
  });

  it("treats a blank custom year share as 0 and points a malformed one at that year", () => {
    const blank = parseForm(form({ planYears: "2", scheduleMode: "custom", downPaymentPct: "50", yearPcts: ["50", ""] }));
    expect(blank.errors).toEqual([]);
    expect(blank.inputs!.schedule.yearShares).toEqual([0.5, 0]);

    const junk = parseForm(form({ planYears: "2", scheduleMode: "custom", downPaymentPct: "50", yearPcts: ["50", "x"] }));
    expect(junk.inputs).toBeNull();
    expect(junk.byField["year-1"]).toMatch(/number/i);
  });

  it("takes a cost's due year as typed: blank means year 1, 0 is outside the plan", () => {
    expect(parseForm(form({ maintenancePct: "8", maintenanceYear: "" })).inputs!.maintenance.year).toBe(1);
    expect(parseForm(form({ maintenancePct: "8", maintenanceYear: "0" })).errors.map((e) => e.field)).toEqual([
      "maintenanceYear",
    ]);
  });

  it("flags a bad currency code beside its field without blocking the result", () => {
    const { inputs, errors, byField } = parseForm(form({ currency: "E" }));
    expect(inputs).not.toBeNull();
    expect(errors).toEqual([]);
    expect(byField.currency).toMatch(/3-letter/i);
    expect(parseForm(form({ currency: "" })).byField.currency).toBeUndefined();
    expect(parseForm(form({ currency: "egp" })).byField.currency).toBeUndefined();
  });

  it("treats blank optional fields as zero", () => {
    const { inputs, errors } = parseForm(
      form({ incomeAmount: "", incomeIncreasePct: "", maintenancePct: "", finishingPct: "", safetyBuffer: "", returnFeePct: "" }),
    );
    expect(errors).toEqual([]);
    expect(inputs!.income.amount).toBe(0);
    expect(inputs!.safetyBuffer).toBe(0);
    expect(inputs!.returnFee).toBe(0);
  });

  it("converts the keep-at-end percentage into a share of starting capital", () => {
    expect(parseForm(form({ keepPct: "30" })).inputs!.minKeptShare).toBeCloseTo(0.3, 12);
    expect(parseForm(form({ keepPct: "" })).inputs!.minKeptShare).toBe(0);
  });

  it("parses the optional test price, blank meaning none", () => {
    expect(parseForm(form({ testPrice: "" })).testPrice).toBeNull();
    expect(parseForm(form({ testPrice: "7,500,000" })).testPrice).toBe(7_500_000);
  });

  it("flags a bad test price beside its field without blocking the result", () => {
    const negative = parseForm(form({ testPrice: "-5" }));
    expect(negative.testPrice).toBeNull();
    expect(negative.inputs).not.toBeNull();
    expect(negative.errors).toEqual([]);
    expect(negative.byField.testPrice).toMatch(/negative/i);
    expect(parseForm(form({ testPrice: "abc" })).byField.testPrice).toMatch(/number/i);
  });
});

describe("resizeYearPcts", () => {
  it("pads with zeros when the plan grows and truncates when it shrinks", () => {
    expect(resizeYearPcts(["10", "20"], 4)).toEqual(["10", "20", "0", "0"]);
    expect(resizeYearPcts(["10", "20", "30"], 2)).toEqual(["10", "20"]);
  });
});

describe("normalizeForm", () => {
  it("fills missing or wrongly-typed fields from the defaults", () => {
    const restored = normalizeForm({ startingCapital: "1", planYears: 8, bogus: true } as unknown);
    expect(restored.startingCapital).toBe("1");
    expect(restored.planYears).toBe(DEFAULT_FORM.planYears);
    expect(restored).not.toHaveProperty("bogus");
  });

  it("returns the defaults for anything that is not an object", () => {
    expect(normalizeForm(null)).toEqual(DEFAULT_FORM);
    expect(normalizeForm("nope")).toEqual(DEFAULT_FORM);
  });
});

describe("parseForm — purchase and loan", () => {
  it("parses a resale with a loan", () => {
    const { inputs, errors } = parseForm(
      form({
        purchaseKind: "resale",
        resaleRemaining: "5,000,000",
        resaleYears: "4",
        resaleFrequency: "quarterly",
        loanEnabled: true,
        loanSharePct: "90",
        loanFlatRatePct: "12",
        loanYears: "5",
        lendingRatioPct: "100",
        certificateRatePct: "11",
        pledgeRelease: "gradual",
      }),
    );
    expect(errors).toEqual([]);
    expect(inputs!.purchase).toEqual({
      kind: "resale",
      cashDiscount: 0,
      resaleRemaining: 5_000_000,
      resaleYears: 4,
      resaleFrequency: "quarterly",
    });
    expect(inputs!.loan).toEqual({
      enabled: true,
      share: 0.9,
      flatRate: 0.12,
      years: 5,
      lendingRatio: 1,
      certificateRate: 0.11,
      release: "gradual",
    });
  });

  it("reads a blank cash discount as 0 and a typed one as a fraction", () => {
    expect(parseForm(form({ purchaseKind: "developer-cash" })).inputs!.purchase!.cashDiscount).toBe(0);
    expect(parseForm(form({ purchaseKind: "developer-cash", cashDiscountPct: "30" })).inputs!.purchase!.cashDiscount).toBe(0.3);
  });

  it("does not let the hidden plan fields block a resale", () => {
    const { inputs, errors, byField } = parseForm(
      form({ purchaseKind: "resale", resaleRemaining: "0", resaleYears: "3", planYears: "", downPaymentPct: "abc" }),
    );
    expect(errors).toEqual([]);
    expect(byField.planYears).toBeUndefined();
    expect(inputs).not.toBeNull();
  });

  it("ignores the loan fields while the loan is off", () => {
    const { inputs, errors } = parseForm(form({ loanEnabled: false, loanYears: "", lendingRatioPct: "x" }));
    expect(errors).toEqual([]);
    expect(inputs!.loan).toBeUndefined();
  });

  it("puts loan problems on the loan's fields", () => {
    // A blank field is caught before the engine runs (existing behaviour), so
    // only it is reported; once every field is a number the engine speaks.
    const { errors } = parseForm(form({ loanEnabled: true, loanYears: "" }));
    expect(errors.map((e) => e.field)).toEqual(["loanYears"]);
    const second = parseForm(form({ loanEnabled: true, lendingRatioPct: "0" }));
    expect(second.errors.map((e) => e.field)).toEqual(["lendingRatioPct"]);
  });

  it("lists purchase fields before the capital and loan fields after the plan", () => {
    const { errors } = parseForm(
      form({
        purchaseKind: "resale",
        resaleRemaining: "0",
        resaleYears: "20",
        startingCapital: "-1",
        loanEnabled: true,
        loanSharePct: "150",
      }),
    );
    expect(errors.map((e) => e.field)).toEqual(["resaleYears", "startingCapital", "loanSharePct"]);
  });
});

describe("normalizeForm — the new fields", () => {
  it("opens a saved pre-loan form on developer installments with the loan off", () => {
    const old = { ...DEFAULT_FORM } as Record<string, unknown>;
    for (const k of ["purchaseKind", "loanEnabled", "pledgeRelease", "loanRatesEdited", "resaleYears"]) delete old[k];
    const f = normalizeForm(old);
    expect(f.purchaseKind).toBe("developer-plan");
    expect(f.loanEnabled).toBe(false);
    expect(f.pledgeRelease).toBe("at-end");
  });
  it("replaces an unknown kind, release or frequency with the default", () => {
    const f = normalizeForm({ ...DEFAULT_FORM, purchaseKind: "lease", pledgeRelease: "never", resaleFrequency: "daily" });
    expect(f.purchaseKind).toBe("developer-plan");
    expect(f.pledgeRelease).toBe("at-end");
    expect(f.resaleFrequency).toBe("yearly");
  });
});
