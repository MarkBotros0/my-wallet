import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORM,
  DEFAULT_MONEY,
  MAX_PLANS,
  equalYearPcts,
  newPlan,
  normalizeForm,
  parseForm,
  planId,
  planName,
  planTerms,
  resizeYearPcts,
  type CapacityForm,
  type MoneyForm,
  type PlanForm,
} from "./capacityForm";

const form = (over: Partial<CapacityForm> = {}): CapacityForm => ({ ...DEFAULT_FORM, ...over });
const withMoney = (m: Partial<MoneyForm>, over: Partial<CapacityForm> = {}) =>
  form({ money: { ...DEFAULT_MONEY, ...m }, ...over });
const withPlan = (id: string, p: Partial<PlanForm>, base: CapacityForm = DEFAULT_FORM): CapacityForm => ({
  ...base,
  plans: base.plans.map((x) => (x.id === id ? { ...x, ...p } : x)),
});

describe("defaults", () => {
  it("parse to two valid plans", () => {
    const parsed = parseForm(DEFAULT_FORM);
    expect(parsed.errors).toEqual([]);
    expect(parsed.plans.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(parsed.plans.every((p) => p.inputs !== null)).toBe(true);
    const [p1, p2] = parsed.plans;
    expect(p1.inputs).toMatchObject({
      startingCapital: 5_000_000,
      savingsVehicle: "fund",
      schedule: { downPayment: 0.1, planYears: 8, mode: "equal", frequency: "yearly" },
      purchase: { kind: "developer-plan", discount: 0 },
    });
    expect(p1.inputs!.effectiveAnnualRate).toBeCloseTo(0.2033, 10);
    expect(p1.inputs).not.toHaveProperty("topUp");
    expect(p2.inputs!.schedule.downPayment).toBe(1);
    expect(p2.inputs!.purchase!.discount).toBe(0.25);
  });

  it("has the shape the brief fixes", () => {
    expect(DEFAULT_FORM).toMatchObject({ version: 2, mode: "max", step: 1, selectedPlanId: "p1", examplesEdited: false });
    expect(DEFAULT_MONEY).toMatchObject({
      currency: "EGP",
      startingCapital: "5,000,000",
      savingsVehicle: "fund",
      fundRatePct: "20.33",
      certificateRatePct: "22",
      incomeFrequency: "monthly",
    });
    expect(newPlan("p9")).toMatchObject({
      kind: "developer",
      nowPct: "10",
      planYears: "8",
      frequency: "yearly",
      scheduleMode: "equal",
      loanEnabled: false,
      loanFlatRatePct: "12",
      loanYears: "5",
      lendingRatioPct: "100",
      loanCertificateRatePct: "11",
      pledgeRelease: "at-end",
      maintenanceYear: "1",
      finishingYear: "1",
    });
  });
});

describe("parseForm — money", () => {
  it("blocks every plan, naming the money field", () => {
    const parsed = parseForm(withMoney({ startingCapital: "" }));
    expect(parsed.plans.every((p) => p.inputs === null)).toBe(true);
    expect(parsed.moneyErrors).toEqual([
      { field: "money.startingCapital", message: expect.stringMatching(/starting capital.*required/i) },
    ]);
    expect(parsed.errors).toEqual(parsed.moneyErrors);
    expect(parsed.byField["money.startingCapital"]).toMatch(/required/i);
  });

  it("uses the certificate rate for a certificate and points rate problems at the active field", () => {
    const ok = parseForm(withMoney({ savingsVehicle: "certificate", certificateRatePct: "22" }));
    expect(ok.plans[0].inputs).toMatchObject({ savingsVehicle: "certificate", effectiveAnnualRate: 0.22 });
    expect(parseForm(withMoney({ fundRatePct: "120" })).errors.map((e) => e.field)).toEqual(["money.fundRatePct"]);
    expect(
      parseForm(withMoney({ savingsVehicle: "certificate", certificateRatePct: "x" })).errors.map((e) => e.field),
    ).toEqual(["money.certificateRatePct"]);
  });

  it("maps engine problems and lists them in page order", () => {
    const { moneyErrors } = parseForm(
      withMoney({ safetyBuffer: "-1", keepPct: "120", returnFeePct: "150", incomeIncreasePct: "150" }),
    );
    expect(moneyErrors.map((e) => e.field)).toEqual([
      "money.returnFeePct",
      "money.incomeIncreasePct",
      "money.safetyBuffer",
      "money.keepPct",
    ]);
  });

  it("flags a bad currency beside its field without blocking", () => {
    const parsed = parseForm(withMoney({ currency: "E" }));
    expect(parsed.errors).toEqual([]);
    expect(parsed.byField["money.currency"]).toMatch(/3-letter/i);
    expect(parseForm(withMoney({ currency: "egp" })).byField["money.currency"]).toBeUndefined();
  });

  it("reads blank optional money as zero", () => {
    const i = parseForm(DEFAULT_FORM).plans[0].inputs!;
    expect(i.income.amount).toBe(0);
    expect(i.safetyBuffer).toBe(0);
    expect(i.returnFee).toBe(0);
    expect(i.minKeptShare).toBe(0);
    expect(parseForm(withMoney({ keepPct: "30" })).plans[0].inputs!.minKeptShare).toBeCloseTo(0.3, 12);
  });
});

describe("parseForm — plans", () => {
  it("carries a plan error on plan.<id>.<key>", () => {
    const parsed = parseForm(withPlan("p2", { nowPct: "150" }));
    expect(parsed.plans[0].inputs).not.toBeNull();
    expect(parsed.plans[1].inputs).toBeNull();
    expect(parsed.errors.map((e) => e.field)).toEqual(["plan.p2.nowPct"]);
    expect(parsed.plans[1].errors).toEqual(parsed.errors);
  });

  it("maps the discount and loan certificate problems", () => {
    expect(parseForm(withPlan("p1", { discountPct: "100" })).errors.map((e) => e.field)).toEqual(["plan.p1.discountPct"]);
    expect(
      parseForm(withPlan("p1", { loanEnabled: true, loanCertificateRatePct: "150" })).errors.map((e) => e.field),
    ).toEqual(["plan.p1.loanCertificateRatePct"]);
  });

  it("points custom-year problems at plan.<id>.year-N and the set at yearPcts", () => {
    const base = withPlan("p1", { planYears: "2", scheduleMode: "custom", nowPct: "50", yearPcts: ["50", "x"] });
    const junk = parseForm(base);
    expect(junk.byField["plan.p1.year-1"]).toMatch(/number/i);
    const blank = parseForm(withPlan("p1", { planYears: "2", scheduleMode: "custom", nowPct: "50", yearPcts: ["50", ""] }));
    expect(blank.errors).toEqual([]);
    expect(blank.plans[0].inputs!.schedule.yearShares).toEqual([0.5, 0]);
    const off = parseForm(withPlan("p1", { planYears: "2", scheduleMode: "custom", nowPct: "10", yearPcts: ["50", "30"] }));
    expect(off.errors.some((e) => e.field === "plan.p1.yearPcts" && /100%/.test(e.message))).toBe(true);
  });

  it("lets 100% now ignore a bad planYears and a custom mode", () => {
    const parsed = parseForm(withPlan("p2", { planYears: "abc", scheduleMode: "custom", yearPcts: ["x"] }));
    expect(parsed.errors).toEqual([]);
    expect(parsed.plans[1].inputs!.schedule).toEqual({ downPayment: 1, planYears: 1, mode: "equal", frequency: "yearly" });
  });

  it("requires a price in top-up mode and ignores it in max mode", () => {
    expect(parseForm(form({ mode: "max" })).plans[0].price).toBeNull();
    const top = parseForm(form({ mode: "topUp" }));
    expect(top.errors).toEqual([
      { field: "plan.p1.price", message: "Enter the price to check." },
      { field: "plan.p2.price", message: "Enter the price to check." },
    ]);
    const ok = parseForm(withPlan("p1", { price: "7,500,000" }, withPlan("p2", { price: "6M" }, form({ mode: "topUp" }))));
    expect(ok.plans[0].price).toBe(7_500_000);
    expect(ok.errors.map((e) => e.field)).toEqual(["plan.p2.price"]);
  });

  it("parses a resale with a loan and reads the developer fields quietly", () => {
    const parsed = parseForm(
      withPlan("p1", {
        kind: "resale",
        resaleRemaining: "5,000,000",
        resaleYears: "4",
        resaleFrequency: "quarterly",
        nowPct: "abc",
        planYears: "",
        loanEnabled: true,
        loanSharePct: "90",
        pledgeRelease: "gradual",
      }),
    );
    expect(parsed.errors).toEqual([]);
    const i = parsed.plans[0].inputs!;
    expect(i.purchase).toEqual({
      kind: "resale",
      discount: 0,
      resaleRemaining: 5_000_000,
      resaleYears: 4,
      resaleFrequency: "quarterly",
    });
    expect(i.loan).toEqual({
      enabled: true,
      share: 0.9,
      flatRate: 0.12,
      years: 5,
      lendingRatio: 1,
      certificateRate: 0.11,
      release: "gradual",
    });
  });

  it("ignores loan fields while the loan is off", () => {
    const parsed = parseForm(withPlan("p1", { loanYears: "", lendingRatioPct: "x" }));
    expect(parsed.errors).toEqual([]);
    expect(parsed.plans[0].inputs!.loan).toBeUndefined();
  });

  it("orders a plan's errors by page and money before plans", () => {
    const parsed = parseForm(
      withPlan(
        "p1",
        { kind: "resale", resaleRemaining: "0", resaleYears: "20", loanEnabled: true, loanSharePct: "150", testPrice: "-3" },
        DEFAULT_FORM,
      ),
    );
    expect(parsed.errors.map((e) => e.field)).toEqual(["plan.p1.resaleYears", "plan.p1.loanSharePct"]);
    const both = parseForm(withPlan("p2", { nowPct: "" }, withMoney({ startingCapital: "" })));
    expect(both.errors.map((e) => e.field)).toEqual(["money.startingCapital", "plan.p2.nowPct"]);
  });

  it("keeps the test price soft", () => {
    const base = withPlan("p1", { testPrice: "7,500,000" });
    expect(parseForm(base).plans[0].testPrice).toBe(7_500_000);
    const bad = parseForm(withPlan("p1", { testPrice: "abc" }));
    expect(bad.errors).toEqual([]);
    expect(bad.plans[0].inputs).not.toBeNull();
    expect(bad.plans[0].testPrice).toBeNull();
    expect(bad.byField["plan.p1.testPrice"]).toMatch(/number/i);
    expect(parseForm(withPlan("p1", { testPrice: "-5" })).byField["plan.p1.testPrice"]).toMatch(/negative/i);
  });
});

describe("year helpers", () => {
  it("resizes and splits", () => {
    expect(resizeYearPcts(["10", "20"], 4)).toEqual(["10", "20", "0", "0"]);
    expect(resizeYearPcts(["10", "20", "30"], 2)).toEqual(["10", "20"]);
    expect(equalYearPcts(10, 3)).toEqual(["30", "30", "30"]);
  });
});

describe("planId / planName / planTerms", () => {
  it("numbers the next plan after the highest", () => {
    expect(planId([])).toBe("p1");
    expect(planId(DEFAULT_FORM.plans)).toBe("p3");
    expect(planId([newPlan("p1"), newPlan("p7")])).toBe("p8");
  });

  it("names plans automatically unless named", () => {
    const base = newPlan("x");
    expect(planName(base)).toBe("10% now · 8 yrs");
    expect(planName({ ...base, nowPct: "100", discountPct: "25" })).toBe("All now · 25% off");
    expect(planName({ ...base, nowPct: "30", discountPct: "10", planYears: "6" })).toBe("30% now, 10% off · 6 yrs");
    expect(planName({ ...base, kind: "resale", resaleRemaining: "5,000,000", resaleYears: "4" })).toBe("Resale · 5M over 4 yrs");
    expect(planName({ ...base, loanEnabled: true })).toBe("10% now · 8 yrs + loan");
    expect(planName({ ...base, name: "  Villa  " })).toBe("Villa");
    expect(planName({ ...base, planYears: "1" })).toBe("10% now · 1 yr");
  });

  it("describes the terms in one line", () => {
    const base = newPlan("x");
    expect(planTerms(base)).toBe("10% now, the rest yearly over 8 years");
    expect(planTerms({ ...base, nowPct: "100", discountPct: "25" })).toBe("All now, 25% off");
    expect(planTerms({ ...base, kind: "resale", resaleRemaining: "5,000,000", resaleYears: "4" })).toBe(
      "Pay the seller now, 5,000,000 to the developer over 4 years",
    );
  });
});

describe("normalizeForm — v2", () => {
  it("round-trips the defaults and returns them for junk", () => {
    expect(normalizeForm(JSON.parse(JSON.stringify(DEFAULT_FORM)))).toEqual(DEFAULT_FORM);
    expect(normalizeForm(null)).toEqual(DEFAULT_FORM);
    expect(normalizeForm("nope")).toEqual(DEFAULT_FORM);
    expect(normalizeForm({ version: 3 })).toEqual(DEFAULT_FORM);
  });

  it("keeps good values, defaults bad ones and drops unknown keys", () => {
    const f = normalizeForm({
      ...DEFAULT_FORM,
      bogus: 1,
      money: { ...DEFAULT_MONEY, startingCapital: "1", fundRatePct: 5, savingsVehicle: "gold", extra: true },
    });
    expect(f.money.startingCapital).toBe("1");
    expect(f.money.fundRatePct).toBe(DEFAULT_MONEY.fundRatePct);
    expect(f.money.savingsVehicle).toBe("fund");
    expect(f).not.toHaveProperty("bogus");
    expect(f.money).not.toHaveProperty("extra");
  });

  it("defaults empty or non-array plans, caps at six, re-ids duplicates", () => {
    expect(normalizeForm({ ...DEFAULT_FORM, plans: [] }).plans).toEqual(DEFAULT_FORM.plans);
    expect(normalizeForm({ ...DEFAULT_FORM, plans: "x" }).plans).toEqual(DEFAULT_FORM.plans);
    const seven = Array.from({ length: 7 }, (_, i) => newPlan(`p${i + 1}`));
    expect(normalizeForm({ ...DEFAULT_FORM, plans: seven }).plans).toHaveLength(MAX_PLANS);
    const dup = normalizeForm({ ...DEFAULT_FORM, plans: [newPlan("p1"), newPlan("p1"), newPlan("")] });
    expect(dup.plans.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("repairs selectedPlanId and step", () => {
    expect(normalizeForm({ ...DEFAULT_FORM, selectedPlanId: "zzz" }).selectedPlanId).toBe("p1");
    expect(normalizeForm({ ...DEFAULT_FORM, selectedPlanId: "p2" }).selectedPlanId).toBe("p2");
    expect(normalizeForm({ ...DEFAULT_FORM, step: 7 }).step).toBe(1);
    expect(normalizeForm({ ...DEFAULT_FORM, step: 3 }).step).toBe(3);
    expect(normalizeForm({ ...DEFAULT_FORM, mode: "weird" }).mode).toBe("max");
  });

  it("fixes mistyped plan fields", () => {
    const f = normalizeForm({ ...DEFAULT_FORM, plans: [{ ...newPlan("p1"), kind: "lease", frequency: "weekly", yearPcts: [1] }] });
    expect(f.plans[0].kind).toBe("developer");
    expect(f.plans[0].frequency).toBe("yearly");
    expect(f.plans[0].yearPcts).toEqual([]);
  });
});

describe("normalizeForm — v1 migration", () => {
  const v1 = {
    currency: "USD",
    startingCapital: "1,000,000",
    rateMode: "effective",
    effectiveRatePct: "12",
    nominalRatePct: "18.51",
    compounding: "365",
    planYears: "6",
    scheduleMode: "custom",
    downPaymentPct: "20",
    yearPcts: ["20", "20", "20", "20"],
    frequency: "quarterly",
    incomeAmount: "5000",
    incomeFrequency: "yearly",
    incomeIncreasePct: "3",
    maintenancePct: "8",
    maintenanceYear: "4",
    finishingPct: "",
    finishingYear: "2",
    safetyBuffer: "100,000",
    returnFeePct: "1",
    keepPct: "30",
    testPrice: "7,000,000",
    purchaseKind: "developer-plan",
    cashDiscountPct: "",
    resaleRemaining: "",
    resaleYears: "4",
    resaleFrequency: "yearly",
    loanEnabled: false,
    loanSharePct: "100",
    loanFlatRatePct: "12",
    loanYears: "5",
    lendingRatioPct: "100",
    certificateRatePct: "11",
    pledgeRelease: "at-end",
    loanRatesEdited: false,
  };

  it("migrates installments into one plan and the money block", () => {
    const f = normalizeForm(v1);
    expect(f).toMatchObject({ version: 2, mode: "max", step: 1, selectedPlanId: "p1", examplesEdited: true });
    expect(f.money).toMatchObject({
      currency: "USD",
      startingCapital: "1,000,000",
      savingsVehicle: "fund",
      fundRatePct: "12",
      incomeAmount: "5000",
      incomeFrequency: "yearly",
      incomeIncreasePct: "3",
      safetyBuffer: "100,000",
      returnFeePct: "1",
      keepPct: "30",
    });
    expect(f.plans).toHaveLength(1);
    expect(f.plans[0]).toMatchObject({
      id: "p1",
      name: "",
      kind: "developer",
      nowPct: "20",
      discountPct: "",
      planYears: "6",
      scheduleMode: "custom",
      frequency: "quarterly",
      maintenancePct: "8",
      maintenanceYear: "4",
      finishingYear: "2",
      testPrice: "7,000,000",
    });
    expect(f.plans[0].yearPcts).toEqual(["20", "20", "20", "20"]);
  });

  it("turns developer cash into 100% now with the discount", () => {
    const f = normalizeForm({ ...v1, purchaseKind: "developer-cash", cashDiscountPct: "15" });
    expect(f.plans[0]).toMatchObject({ kind: "developer", nowPct: "100", discountPct: "15" });
  });

  it("converts a nominal rate to its effective equivalent", () => {
    const f = normalizeForm({ ...v1, rateMode: "nominal", nominalRatePct: "18.51", compounding: "365" });
    expect(Number(f.money.fundRatePct)).toBeCloseTo(20.33, 1);
    expect(f.money.fundRatePct).toMatch(/^\d+\.\d{2}$/);
  });

  it("migrates a resale with a loan", () => {
    const f = normalizeForm({
      ...v1,
      purchaseKind: "resale",
      resaleRemaining: "5,000,000",
      resaleYears: "4",
      resaleFrequency: "quarterly",
      loanEnabled: true,
      loanSharePct: "90",
      certificateRatePct: "13",
      pledgeRelease: "gradual",
      loanRatesEdited: true,
    });
    expect(f.plans[0]).toMatchObject({
      kind: "resale",
      resaleRemaining: "5,000,000",
      resaleYears: "4",
      resaleFrequency: "quarterly",
      loanEnabled: true,
      loanSharePct: "90",
      loanCertificateRatePct: "13",
      pledgeRelease: "gradual",
      loanRatesEdited: true,
    });
    expect(parseForm(f).errors).toEqual([]);
  });

  it("falls back per field on a corrupt v1 form", () => {
    const f = normalizeForm({ startingCapital: "1", planYears: 8, bogus: true });
    expect(f.money.startingCapital).toBe("1");
    expect(f.plans[0].planYears).toBe("8");
  });
});
