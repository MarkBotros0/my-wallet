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
