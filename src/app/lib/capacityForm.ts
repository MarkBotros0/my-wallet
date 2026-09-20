import {
  effectiveFromNominal,
  inputProblems,
  type CalculatorInputs,
  type CompoundingFrequency,
  type IncomeFrequency,
  type InputField,
  type PaymentFrequency,
} from "@/lib/capacity";
import { formatPct } from "./format";
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
  // Grouped like the input rewrites it on blur, so the first screen matches.
  startingCapital: "5,000,000",
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

/**
 * A form field an error can point at. The custom-schedule year inputs are
 * `year-0`, `year-1`, … for a problem with one of them; `yearPcts` is a
 * problem with the set (the total, the count).
 */
export type FormField =
  | "currency"
  | "startingCapital"
  | "effectiveRatePct"
  | "nominalRatePct"
  | "returnFeePct"
  | "planYears"
  | "downPaymentPct"
  | "yearPcts"
  | `year-${number}`
  | "incomeAmount"
  | "incomeIncreasePct"
  | "maintenancePct"
  | "maintenanceYear"
  | "finishingPct"
  | "finishingYear"
  | "safetyBuffer"
  | "keepPct"
  | "testPrice";

export interface FormError {
  field: FormField;
  message: string;
}

/** The page's order, so a list of errors reads top to bottom. Year fields slot in after the down payment. */
const FIELD_ORDER: readonly FormField[] = [
  "startingCapital",
  "currency",
  "effectiveRatePct",
  "nominalRatePct",
  "returnFeePct",
  "planYears",
  "downPaymentPct",
  "yearPcts",
  "incomeAmount",
  "incomeIncreasePct",
  "maintenancePct",
  "maintenanceYear",
  "finishingPct",
  "finishingYear",
  "safetyBuffer",
  "keepPct",
  "testPrice",
];

function fieldOrder(field: FormField): number {
  if (field.startsWith("year-")) return FIELD_ORDER.indexOf("yearPcts") - 0.5 + Number(field.slice(5)) / 1e6;
  return FIELD_ORDER.indexOf(field);
}

/** Where each of the engine's inputs is typed. The rate depends on the entry mode, handled in parseForm. */
const ENGINE_FIELDS: Record<Exclude<InputField, "effectiveAnnualRate">, FormField> = {
  startingCapital: "startingCapital",
  safetyBuffer: "safetyBuffer",
  returnFee: "returnFeePct",
  minKeptShare: "keepPct",
  "income.amount": "incomeAmount",
  "income.annualIncrease": "incomeIncreasePct",
  "schedule.planYears": "planYears",
  "schedule.downPayment": "downPaymentPct",
  "schedule.yearShares": "yearPcts",
  "maintenance.share": "maintenancePct",
  "maintenance.year": "maintenanceYear",
  "finishing.share": "finishingPct",
  "finishing.year": "finishingYear",
};

export interface ParsedForm {
  inputs: CalculatorInputs | null;
  /** What stops the calculator, in page order — the summary above the results. */
  errors: FormError[];
  /** Every problem by field, blocking or not — what each field shows beneath itself. */
  byField: Partial<Record<FormField, string>>;
  /** Parsed separately so a bad test price does not block the main result. */
  testPrice: number | null;
}

export function parseForm(form: CapacityForm): ParsedForm {
  const errors: FormError[] = [];
  // Problems the result does not depend on (a cosmetic code, an optional extra).
  const soft: FormError[] = [];

  const required = (field: FormField, raw: string, label: string): number => {
    if (raw.trim() === "") {
      errors.push({ field, message: `${label} is required.` });
      return NaN;
    }
    const n = parseNumber(raw);
    if (n === null) errors.push({ field, message: `${label} must be a number.` });
    return n ?? NaN;
  };
  const optional = (field: FormField, raw: string, label: string, blank = 0): number => {
    if (raw.trim() === "") return blank;
    return required(field, raw, label);
  };

  const startingCapital = required("startingCapital", form.startingCapital, "Starting capital");

  const n = Number(form.compounding) as CompoundingFrequency;
  const rateField: FormField = form.rateMode === "effective" ? "effectiveRatePct" : "nominalRatePct";
  const effectiveAnnualRate =
    form.rateMode === "effective"
      ? required(rateField, form.effectiveRatePct, "Return rate") / 100
      : effectiveFromNominal(required(rateField, form.nominalRatePct, "Return rate") / 100, n);

  const planYears = required("planYears", form.planYears, "Plan length");
  const downPayment = required("downPaymentPct", form.downPaymentPct, "Down payment") / 100;

  const schedule: CalculatorInputs["schedule"] =
    form.scheduleMode === "custom"
      ? {
          downPayment,
          planYears,
          mode: "custom",
          // A cleared year field is a year with nothing due; the 100% check
          // says whether that adds up.
          yearShares: form.yearPcts.map((p, i) => optional(`year-${i}`, p, `Year ${i + 1} share`) / 100),
          frequency: form.frequency,
        }
      : { downPayment, planYears, mode: "equal", frequency: form.frequency };

  const inputs: CalculatorInputs = {
    startingCapital,
    effectiveAnnualRate,
    schedule,
    income: {
      amount: optional("incomeAmount", form.incomeAmount, "Extra income"),
      frequency: form.incomeFrequency,
      annualIncrease: optional("incomeIncreasePct", form.incomeIncreasePct, "Income increase") / 100,
    },
    maintenance: {
      share: optional("maintenancePct", form.maintenancePct, "Maintenance deposit") / 100,
      year: optional("maintenanceYear", form.maintenanceYear, "Maintenance year", 1),
    },
    finishing: {
      share: optional("finishingPct", form.finishingPct, "Finishing cost") / 100,
      year: optional("finishingYear", form.finishingYear, "Finishing year", 1),
    },
    safetyBuffer: optional("safetyBuffer", form.safetyBuffer, "Safety buffer"),
    returnFee: optional("returnFeePct", form.returnFeePct, "Fees on returns") / 100,
    minKeptShare: optional("keepPct", form.keepPct, "Money to keep at the end") / 100,
  };

  // Only run the engine's own checks once every field is at least a number —
  // otherwise NaN produces a second, confusing message for the same field.
  if (errors.length === 0) {
    for (const problem of inputProblems(inputs)) {
      if (problem.field !== "effectiveAnnualRate") {
        errors.push({ field: ENGINE_FIELDS[problem.field], message: problem.message });
      } else if (form.rateMode === "effective") {
        errors.push({ field: rateField, message: problem.message });
      } else {
        // The user typed a nominal rate; say what it works out to.
        errors.push({
          field: rateField,
          message: `Equivalent effective yield is ${formatPct(effectiveAnnualRate)}; it must be between 0% and 100%.`,
        });
      }
    }
  }
  errors.sort((a, b) => fieldOrder(a.field) - fieldOrder(b.field));

  const currency = form.currency.trim().toUpperCase();
  if (currency !== "" && !/^[A-Z]{3}$/.test(currency)) {
    soft.push({ field: "currency", message: "Currency must be a 3-letter code like EGP." });
  }

  let testPrice: number | null = null;
  if (form.testPrice.trim() !== "") {
    const p = parseNumber(form.testPrice);
    if (p === null) soft.push({ field: "testPrice", message: "Price to test must be a number." });
    else if (p < 0) soft.push({ field: "testPrice", message: "Price to test cannot be negative." });
    else testPrice = p;
  }

  const byField: ParsedForm["byField"] = {};
  for (const e of [...errors, ...soft]) byField[e.field] ??= e.message;

  return { inputs: errors.length === 0 ? inputs : null, errors, byField, testPrice };
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
