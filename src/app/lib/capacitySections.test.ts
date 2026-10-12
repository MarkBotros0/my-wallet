import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, type CapacityForm } from "./capacityForm";
import { SECTIONS, sectionOf, sectionSummary } from "./capacitySections";

const form = (over: Partial<CapacityForm> = {}): CapacityForm => ({ ...DEFAULT_FORM, ...over });

describe("sectionOf", () => {
  it("puts every field in the section it is typed in", () => {
    expect(sectionOf("cashDiscountPct")).toBe("buy");
    expect(sectionOf("startingCapital")).toBe("money");
    expect(sectionOf("keepPct")).toBe("money");
    expect(sectionOf("planYears")).toBe("payments");
    expect(sectionOf("year-3")).toBe("payments");
    expect(sectionOf("resaleRemaining")).toBe("payments");
    expect(sectionOf("lendingRatioPct")).toBe("loan");
    expect(sectionOf("finishingYear")).toBe("extras");
    expect(sectionOf("testPrice")).toBeNull();
  });
  it("lists the sections in page order", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(["buy", "money", "payments", "loan", "extras"]);
  });
});

describe("sectionSummary", () => {
  it("says how the property is bought, and whether a loan is on", () => {
    expect(sectionSummary("buy", form())).toBe("Developer installments");
    expect(sectionSummary("buy", form({ purchaseKind: "developer-cash", cashDiscountPct: "30" }))).toBe(
      "Developer cash · 30% off",
    );
    expect(sectionSummary("buy", form({ purchaseKind: "resale", loanEnabled: true }))).toBe("Resale · with a loan");
  });
  it("sums up the money", () => {
    expect(sectionSummary("money", form({ startingCapital: "5,000,000", safetyBuffer: "500,000" }))).toBe(
      "5,000,000 EGP · 20.33% return · buffer 500,000",
    );
    expect(sectionSummary("money", form({ rateMode: "nominal", nominalRatePct: "18.51", safetyBuffer: "" }))).toBe(
      "5,000,000 EGP · 18.51% nominal return",
    );
  });
  it("sums up the payments for each kind", () => {
    expect(sectionSummary("payments", form())).toBe("10% down · 8 years · yearly");
    expect(sectionSummary("payments", form({ purchaseKind: "developer-cash" }))).toBe(
      "Compared against 10% down · 8 years · yearly",
    );
    expect(
      sectionSummary("payments", form({ purchaseKind: "resale", resaleRemaining: "5,000,000", resaleYears: "4" })),
    ).toBe("5,000,000 left · 4 years · yearly");
  });
  it("sums up the loan, or says it is off", () => {
    expect(sectionSummary("loan", form())).toBe("Off");
    expect(sectionSummary("loan", form({ loanEnabled: true }))).toBe("100% borrowed · 12% flat · 5 years");
  });
  it("lists income and costs, or says there are none", () => {
    expect(sectionSummary("extras", form())).toBe("None");
    expect(
      sectionSummary("extras", form({ incomeAmount: "40,000", maintenancePct: "8", maintenanceYear: "4" })),
    ).toBe("40,000 a month · maintenance 8% in year 4");
  });
});
