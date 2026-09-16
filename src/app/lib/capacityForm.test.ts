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

  it("reports a custom schedule that does not total 100%", () => {
    const { inputs, errors } = parseForm(
      form({ planYears: "2", scheduleMode: "custom", downPaymentPct: "10", yearPcts: ["50", "50"] }),
    );
    expect(inputs).toBeNull();
    expect(errors.some((e) => /100%/.test(e))).toBe(true);
  });

  it("names the field when a required number is missing or malformed", () => {
    const { inputs, errors } = parseForm(form({ startingCapital: "", effectiveRatePct: "abc" }));
    expect(inputs).toBeNull();
    expect(errors.some((e) => /starting capital/i.test(e))).toBe(true);
    expect(errors.some((e) => /return rate/i.test(e))).toBe(true);
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
