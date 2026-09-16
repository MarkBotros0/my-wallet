import { describe, expect, it } from "vitest";
import {
  dailyRate,
  effectiveFromNominal,
  monthlyRate,
  nominalFromEffective,
} from "./rates";

// Reference figures from the spec: a 20.33% effective annual yield is
// 18.51% nominal compounded daily and 18.65% nominal compounded monthly.
const EFFECTIVE = 0.2033;
const TOLERANCE = 0.0001; // ±0.01 percentage points

describe("rate conversion", () => {
  it("converts 20.33% effective to 18.51% nominal compounded daily", () => {
    expect(Math.abs(nominalFromEffective(EFFECTIVE, 365) - 0.1851)).toBeLessThan(TOLERANCE);
  });

  it("converts 20.33% effective to 18.65% nominal compounded monthly", () => {
    expect(Math.abs(nominalFromEffective(EFFECTIVE, 12) - 0.1865)).toBeLessThan(TOLERANCE);
  });

  it("converts 18.51% nominal daily back to 20.33% effective", () => {
    expect(Math.abs(effectiveFromNominal(0.1851, 365) - EFFECTIVE)).toBeLessThan(TOLERANCE);
  });

  it("round-trips nominal → effective → nominal for every compounding frequency", () => {
    for (const n of [1, 4, 12, 365] as const) {
      const eff = effectiveFromNominal(0.15, n);
      expect(nominalFromEffective(eff, n)).toBeCloseTo(0.15, 12);
    }
  });

  it("treats yearly compounding as the identity", () => {
    expect(effectiveFromNominal(0.2, 1)).toBeCloseTo(0.2, 12);
    expect(nominalFromEffective(0.2, 1)).toBeCloseTo(0.2, 12);
  });

  it("derives monthly and daily rates that compound back to the effective rate", () => {
    expect(Math.pow(1 + monthlyRate(EFFECTIVE), 12) - 1).toBeCloseTo(EFFECTIVE, 12);
    expect(Math.pow(1 + dailyRate(EFFECTIVE), 365) - 1).toBeCloseTo(EFFECTIVE, 12);
  });

  it("keeps a 0% rate at 0% in every form", () => {
    expect(effectiveFromNominal(0, 12)).toBe(0);
    expect(nominalFromEffective(0, 365)).toBe(0);
    expect(monthlyRate(0)).toBe(0);
    expect(dailyRate(0)).toBe(0);
  });
});
