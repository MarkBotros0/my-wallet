import {
  effectiveFromNominal,
  validateInputs,
  type CalculatorInputs,
  type CompoundingFrequency,
  type IncomeFrequency,
  type PaymentFrequency,
} from "@/lib/capacity";
import { parseNumber } from "./numbers";

/**
 * The calculator's form as the user typed it — strings, percentages, one
 * field per input — and the conversion into the engine's `CalculatorInputs`
 * (numbers, fractions). Keeping the form as strings is what lets a half-typed
 * "1." or an empty field sit in the input without fighting the user; parsing
 * happens once, here, on the way to the maths.
 *
 * No React in this file so it can be unit-tested beside the engine.
 */

export type RateEntryMode = "effective" | "nominal";
export type CompoundingOption = "1" | "4" | "12" | "365";

export interface CapacityForm {
  currency: string;
  startingCapital: string;
  rateMode: RateEntryMode;
  /** The field the user edits in "effective" mode. */
  effectiveRatePct: string;
  /** The field the user edits in "nominal" mode. */
  nominalRatePct: string;
  compounding: CompoundingOption;
  planYears: string;
  scheduleMode: "equal" | "custom";
  downPaymentPct: string;
  /** Custom mode only; kept the same length as planYears by `resizeYearPcts`. */
  yearPcts: string[];
  frequency: PaymentFrequency;
  incomeAmount: string;
  incomeFrequency: IncomeFrequency;
  incomeIncreasePct: string;
  maintenancePct: string;
  maintenanceYear: string;
  finishingPct: string;
  finishingYear: string;
  safetyBuffer: string;
  returnFeePct: string;
  /** Share of the starting capital to still have at the end, as a percent; blank = none. */
  keepPct: string;
  /** A specific price to test; blank means none. */
  testPrice: string;
}

export const DEFAULT_FORM: CapacityForm = {
  currency: "EGP",
  startingCapital: "5000000",
  rateMode: "effective",
  effectiveRatePct: "20.33",
  nominalRatePct: "18.51",
  compounding: "365",
  planYears: "8",
  scheduleMode: "equal",
  downPaymentPct: "10",
  yearPcts: [],
  frequency: "yearly",
  incomeAmount: "",
  incomeFrequency: "monthly",
  incomeIncreasePct: "",
  maintenancePct: "",
  maintenanceYear: "1",
  finishingPct: "",
  finishingYear: "1",
  safetyBuffer: "",
  returnFeePct: "",
  keepPct: "",
  testPrice: "",
};

export const COMPOUNDING_LABELS: Record<CompoundingOption, string> = {
  "365": "daily",
  "12": "monthly",
  "4": "quarterly",
  "1": "yearly",
};

export { parseNumber };

/** Keep the custom-year list exactly `years` long: pad with "0", drop extras. */
export function resizeYearPcts(current: string[], years: number): string[] {
  const n = Math.max(0, Math.floor(years));
  return Array.from({ length: n }, (_, i) => current[i] ?? "0");
}

/** An equal split of what the down payment leaves, as percent strings. */
export function equalYearPcts(downPaymentPct: number, years: number): string[] {
  if (years <= 0) return [];
  const each = (100 - downPaymentPct) / years;
  return Array.from({ length: years }, () => trimPct(each));
}

function trimPct(n: number): string {
  return Number(n.toFixed(4)).toString();
}

export interface ParsedForm {
  inputs: CalculatorInputs | null;
  errors: string[];
  /** Parsed separately so a bad test price does not block the main result. */
  testPrice: number | null;
  testPriceError: string | null;
}

export function parseForm(form: CapacityForm): ParsedForm {
  const errors: string[] = [];

  const required = (raw: string, label: string): number => {
    const n = parseNumber(raw);
    if (n === null) errors.push(`${label} must be a number.`);
    return n ?? NaN;
  };
  const optional = (raw: string, label: string): number => {
    if (raw.trim() === "") return 0;
    return required(raw, label);
  };

  const startingCapital = required(form.startingCapital, "Starting capital");

  const n = Number(form.compounding) as CompoundingFrequency;
  const effectiveAnnualRate =
    form.rateMode === "effective"
      ? required(form.effectiveRatePct, "Return rate") / 100
      : effectiveFromNominal(required(form.nominalRatePct, "Return rate") / 100, n);

  const planYears = required(form.planYears, "Plan length");
  const downPayment = required(form.downPaymentPct, "Down payment") / 100;

  const schedule: CalculatorInputs["schedule"] =
    form.scheduleMode === "custom"
      ? {
          downPayment,
          planYears,
          mode: "custom",
          yearShares: form.yearPcts.map((p, i) => required(p, `Year ${i + 1} share`) / 100),
          frequency: form.frequency,
        }
      : { downPayment, planYears, mode: "equal", frequency: form.frequency };

  const inputs: CalculatorInputs = {
    startingCapital,
    effectiveAnnualRate,
    schedule,
    income: {
      amount: optional(form.incomeAmount, "Extra income"),
      frequency: form.incomeFrequency,
      annualIncrease: optional(form.incomeIncreasePct, "Income increase") / 100,
    },
    maintenance: {
      share: optional(form.maintenancePct, "Maintenance deposit") / 100,
      year: optional(form.maintenanceYear, "Maintenance year") || 1,
    },
    finishing: {
      share: optional(form.finishingPct, "Finishing cost") / 100,
      year: optional(form.finishingYear, "Finishing year") || 1,
    },
    safetyBuffer: optional(form.safetyBuffer, "Safety buffer"),
    returnFee: optional(form.returnFeePct, "Fees on returns") / 100,
    minKeptShare: optional(form.keepPct, "Money to keep at the end") / 100,
  };

  // Only run the engine's own checks once every field is at least a number —
  // otherwise NaN produces a second, confusing message for the same field.
  if (errors.length === 0) errors.push(...validateInputs(inputs));

  let testPrice: number | null = null;
  let testPriceError: string | null = null;
  if (form.testPrice.trim() !== "") {
    const p = parseNumber(form.testPrice);
    if (p === null || p < 0) testPriceError = "Price to test must be a number.";
    else testPrice = p;
  }

  return { inputs: errors.length === 0 ? inputs : null, errors, testPrice, testPriceError };
}

/**
 * Rebuild a form from whatever was persisted: every known field with the
 * right type is kept, anything missing, mistyped or unknown falls back to the
 * default. This is what makes adding a field later safe for existing devices.
 */
export function normalizeForm(raw: unknown): CapacityForm {
  if (!raw || typeof raw !== "object") return DEFAULT_FORM;
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_FORM) as (keyof CapacityForm)[]) {
    const def = DEFAULT_FORM[key];
    const val = src[key];
    if (Array.isArray(def)) {
      out[key] = Array.isArray(val) && val.every((v) => typeof v === "string") ? val : def;
    } else {
      out[key] = typeof val === typeof def ? val : def;
    }
  }
  return out as unknown as CapacityForm;
}
