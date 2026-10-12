import {
  effectiveFromNominal,
  inputProblems,
  paymentsPerYear,
  type CalculatorInputs,
  type CompoundingFrequency,
  type IncomeFrequency,
  type InputField,
  type LoanInput,
  type PaymentFrequency,
  type PledgeRelease,
  type PurchaseInput,
  type SavingsVehicle,
} from "@/lib/capacity";
import { formatCompact } from "./format";
import { parseNumber } from "./numbers";

/**
 * The calculator's form as the user typed it — strings, percentages, one
 * field per input — and the conversion into the engine's `CalculatorInputs`
 * (numbers, fractions). Keeping the form as strings is what lets a half-typed
 * "1." or an empty field sit in the input without fighting the user; parsing
 * happens once, here, on the way to the maths.
 *
 * Version 2: the user's money is entered ONCE (`MoneyForm`) and the ways of
 * buying are a list of plans (`PlanForm`), each parsed against the same money.
 *
 * No React in this file so it can be unit-tested beside the engine.
 */

export type Mode = "max" | "topUp";
export type Step = 1 | 2 | 3;
export const MAX_PLANS = 6;

export interface MoneyForm {
  currency: string;
  startingCapital: string;
  savingsVehicle: SavingsVehicle;
  /** Effective yearly yield of a fund. */
  fundRatePct: string;
  /** Quoted annual rate of a certificate, paid monthly. */
  certificateRatePct: string;
  returnFeePct: string;
  incomeAmount: string;
  incomeFrequency: IncomeFrequency;
  incomeIncreasePct: string;
  safetyBuffer: string;
  /** Share of the starting capital to still have at the end, as a percent; blank = none. */
  keepPct: string;
}

export type PlanKind = "developer" | "resale";

export interface PlanForm {
  id: string;
  /** Blank = the automatic name (`planName`). */
  name: string;
  kind: PlanKind;
  /** The list price (developer) / cash to the seller (resale): required in top-up mode, an optional asking price in max mode. */
  price: string;
  discountPct: string;
  nowPct: string;
  planYears: string;
  scheduleMode: "equal" | "custom";
  /** Custom mode only; kept the same length as planYears by `resizeYearPcts`. */
  yearPcts: string[];
  frequency: PaymentFrequency;
  resaleRemaining: string;
  /** resale: how many installments the seller still owes; read with `resaleFrequency`. */
  resaleInstallments: string;
  resaleFrequency: PaymentFrequency;
  maintenancePct: string;
  maintenanceYear: string;
  finishingPct: string;
  finishingYear: string;
  loanEnabled: boolean;
  loanSharePct: string;
  loanFlatRatePct: string;
  loanYears: string;
  lendingRatioPct: string;
  loanCertificateRatePct: string;
  pledgeRelease: PledgeRelease;
  /** False until the user edits a bank rate — until then they are labelled as examples. */
  loanRatesEdited: boolean;
  /** A specific price to test; blank means none. */
  testPrice: string;
}

export interface CapacityForm {
  version: 2;
  mode: Mode;
  step: Step;
  money: MoneyForm;
  plans: PlanForm[];
  selectedPlanId: string;
  /** False until the user edits the example plans. */
  examplesEdited: boolean;
}

export const DEFAULT_MONEY: MoneyForm = {
  currency: "EGP",
  // Grouped like the input rewrites it on blur, so the first screen matches.
  startingCapital: "5,000,000",
  savingsVehicle: "fund",
  fundRatePct: "20.33",
  certificateRatePct: "22",
  returnFeePct: "",
  incomeAmount: "",
  incomeFrequency: "monthly",
  incomeIncreasePct: "",
  safetyBuffer: "",
  keepPct: "",
};

export function newPlan(id: string, patch: Partial<PlanForm> = {}): PlanForm {
  return {
    id,
    name: "",
    kind: "developer",
    price: "",
    discountPct: "",
    nowPct: "10",
    planYears: "8",
    scheduleMode: "equal",
    yearPcts: [],
    frequency: "yearly",
    resaleRemaining: "",
    resaleInstallments: "4",
    resaleFrequency: "yearly",
    maintenancePct: "",
    maintenanceYear: "1",
    finishingPct: "",
    finishingYear: "1",
    loanEnabled: false,
    loanSharePct: "100",
    // Examples, labelled as such until edited — never mistaken for a quote.
    loanFlatRatePct: "12",
    loanYears: "5",
    lendingRatioPct: "100",
    loanCertificateRatePct: "11",
    pledgeRelease: "at-end",
    loanRatesEdited: false,
    testPrice: "",
    ...patch,
  };
}

export const DEFAULT_FORM: CapacityForm = {
  version: 2,
  mode: "max",
  step: 1,
  money: DEFAULT_MONEY,
  plans: [newPlan("p1"), newPlan("p2", { nowPct: "100", discountPct: "25" })],
  selectedPlanId: "p1",
  examplesEdited: false,
};

/** "p" + (highest numeric suffix + 1). */
export function planId(existing: PlanForm[]): string {
  let max = 0;
  for (const p of existing) {
    const m = /^p(\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `p${max + 1}`;
}

export { parseNumber };

/** Keep the custom-year list exactly `years` long: pad with "0", drop extras. */
export function resizeYearPcts(current: string[], years: number): string[] {
  const n = Math.max(0, Math.floor(years));
  return Array.from({ length: n }, (_, i) => current[i] ?? "0");
}

/** An equal split of what the payment now leaves, as percent strings. */
export function equalYearPcts(nowPct: number, years: number): string[] {
  if (years <= 0) return [];
  const each = (100 - nowPct) / years;
  return Array.from({ length: years }, () => trimPct(each));
}

function trimPct(n: number): string {
  return Number(n.toFixed(4)).toString();
}

// ---------------------------------------------------------------------------
// Names and one-line terms
// ---------------------------------------------------------------------------

const num = (raw: string): number => parseNumber(raw) ?? 0;
const yrs = (n: number) => `${n} ${n === 1 ? "yr" : "yrs"}`;
const grouped = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const FREQ_WORD: Record<PaymentFrequency, string> = { yearly: "yearly", quarterly: "quarterly", monthly: "monthly" };

/** The user's name for the plan, else a name made from its terms. */
export function planName(plan: PlanForm): string {
  const custom = plan.name.trim();
  if (custom) return custom;
  const loan = plan.loanEnabled ? " + loan" : "";
  if (plan.kind === "resale") {
    const owed = num(plan.resaleRemaining);
    return (owed > 0 ? `Resale · ${formatCompact(owed)} · ${num(plan.resaleInstallments)} ${FREQ_WORD[plan.resaleFrequency]}` : "Resale") + loan;
  }
  const now = num(plan.nowPct);
  const off = num(plan.discountPct);
  if (now >= 100) return (off > 0 ? `All now · ${off}% off` : "All now") + loan;
  const head = off > 0 ? `${now}% now, ${off}% off` : `${now}% now`;
  return `${head} · ${yrs(num(plan.planYears))}${loan}`;
}

/** The plan's terms in one line. */
export function planTerms(plan: PlanForm): string {
  if (plan.kind === "resale") {
    const n = num(plan.resaleInstallments);
    return `Pay the seller now, ${grouped(num(plan.resaleRemaining))} to the developer in ${n} ${FREQ_WORD[plan.resaleFrequency]} ${n === 1 ? "installment" : "installments"}`;
  }
  const now = num(plan.nowPct);
  const off = num(plan.discountPct);
  const offText = off > 0 ? `, ${off}% off` : "";
  if (now >= 100) return `All now${offText}`;
  const years = num(plan.planYears);
  const how = plan.scheduleMode === "custom" ? "on your own schedule" : FREQ_WORD[plan.frequency];
  return `${now}% now, the rest ${how} over ${years} ${years === 1 ? "year" : "years"}${offText}`;
}

// ---------------------------------------------------------------------------
// Fields and errors
// ---------------------------------------------------------------------------

export type MoneyField = `money.${keyof MoneyForm}`;
/** `plan.<id>.<PlanForm key>`, or `plan.<id>.year-N` for one custom-schedule year. */
export type PlanField = `plan.${string}.${string}`;
export type FormField = MoneyField | PlanField;

export interface FormError {
  field: FormField;
  message: string;
}

export interface ParsedPlan {
  id: string;
  inputs: CalculatorInputs | null;
  errors: FormError[];
  /** The price, parsed (null when blank or bad); in max mode, the asking price to check. */
  price: number | null;
  testPrice: number | null;
}

export interface ParsedForm {
  moneyErrors: FormError[];
  plans: ParsedPlan[];
  /** All blocking errors: money first, then plans in list order, each in page order. */
  errors: FormError[];
  /** Every problem by field, blocking or not — what each field shows beneath itself. */
  byField: Partial<Record<FormField, string>>;
}

const MONEY_ORDER: readonly (keyof MoneyForm)[] = [
  "startingCapital",
  "currency",
  "fundRatePct",
  "certificateRatePct",
  "returnFeePct",
  "incomeAmount",
  "incomeIncreasePct",
  "safetyBuffer",
  "keepPct",
];

const PLAN_ORDER: readonly string[] = [
  "kind",
  "name",
  "price",
  "discountPct",
  "nowPct",
  "planYears",
  "yearPcts", // year-N slot in just before it
  "resaleRemaining",
  "resaleInstallments",
  "loanSharePct",
  "loanFlatRatePct",
  "loanYears",
  "loanCertificateRatePct",
  "lendingRatioPct",
  "maintenancePct",
  "maintenanceYear",
  "finishingPct",
  "finishingYear",
  "testPrice",
];

function moneyOrder(key: string): number {
  return MONEY_ORDER.indexOf(key as keyof MoneyForm);
}

function planOrder(key: string): number {
  if (key.startsWith("year-")) return PLAN_ORDER.indexOf("yearPcts") - 0.5 + Number(key.slice(5)) / 1e6;
  return PLAN_ORDER.indexOf(key);
}

const planKey = (field: string) => field.slice(field.indexOf(".", 5) + 1);

/** Engine inputs that belong to the money block; the rest belong to a plan. */
const MONEY_ENGINE: Partial<Record<InputField, keyof MoneyForm>> = {
  startingCapital: "startingCapital",
  safetyBuffer: "safetyBuffer",
  returnFee: "returnFeePct",
  minKeptShare: "keepPct",
  "income.amount": "incomeAmount",
  "income.annualIncrease": "incomeIncreasePct",
};

const PLAN_ENGINE: Partial<Record<InputField, keyof PlanForm>> = {
  "schedule.planYears": "planYears",
  "schedule.downPayment": "nowPct",
  "schedule.yearShares": "yearPcts",
  "maintenance.share": "maintenancePct",
  "maintenance.year": "maintenanceYear",
  "finishing.share": "finishingPct",
  "finishing.year": "finishingYear",
  "purchase.discount": "discountPct",
  "purchase.resaleRemaining": "resaleRemaining",
  "purchase.resaleInstallments": "resaleInstallments",
  "loan.share": "loanSharePct",
  "loan.flatRate": "loanFlatRatePct",
  "loan.years": "loanYears",
  "loan.lendingRatio": "lendingRatioPct",
  "loan.certificateRate": "loanCertificateRatePct",
};

interface ParsedMoney {
  /** The money half of CalculatorInputs, NaN where a field is bad. */
  base: Pick<
    CalculatorInputs,
    "startingCapital" | "effectiveAnnualRate" | "savingsVehicle" | "income" | "safetyBuffer" | "returnFee" | "minKeptShare"
  >;
  errors: FormError[];
  soft: FormError[];
}

function parseMoney(m: MoneyForm): ParsedMoney {
  const errors: FormError[] = [];
  const soft: FormError[] = [];
  const required = (key: keyof MoneyForm, raw: string, label: string): number => {
    const field: FormField = `money.${key}`;
    if (raw.trim() === "") {
      errors.push({ field, message: `${label} is required.` });
      return NaN;
    }
    const n = parseNumber(raw);
    if (n === null) errors.push({ field, message: `${label} must be a number.` });
    return n ?? NaN;
  };
  const optional = (key: keyof MoneyForm, raw: string, label: string): number =>
    raw.trim() === "" ? 0 : required(key, raw, label);

  const startingCapital = required("startingCapital", m.startingCapital, "Starting capital");
  const rateKey = m.savingsVehicle === "certificate" ? "certificateRatePct" : "fundRatePct";
  const effectiveAnnualRate = required(rateKey, m[rateKey], "Return rate") / 100;
  const base: ParsedMoney["base"] = {
    startingCapital,
    effectiveAnnualRate,
    savingsVehicle: m.savingsVehicle,
    income: {
      amount: optional("incomeAmount", m.incomeAmount, "Extra income"),
      frequency: m.incomeFrequency,
      annualIncrease: optional("incomeIncreasePct", m.incomeIncreasePct, "Income increase") / 100,
    },
    safetyBuffer: optional("safetyBuffer", m.safetyBuffer, "Safety buffer"),
    returnFee: optional("returnFeePct", m.returnFeePct, "Fees on returns") / 100,
    minKeptShare: optional("keepPct", m.keepPct, "Savings to keep at the end") / 100,
  };

  const currency = m.currency.trim().toUpperCase();
  if (currency !== "" && !/^[A-Z]{3}$/.test(currency)) {
    soft.push({ field: "money.currency", message: "Currency must be a 3-letter code like EGP." });
  }
  return { base, errors, soft };
}

interface PlanParse {
  inputs: CalculatorInputs;
  errors: FormError[];
  soft: FormError[];
  price: number | null;
  testPrice: number | null;
}

function parsePlan(p: PlanForm, money: ParsedMoney["base"], mode: Mode): PlanParse {
  const errors: FormError[] = [];
  const soft: FormError[] = [];
  const at = (key: string): FormField => `plan.${p.id}.${key}`;

  const required = (key: string, raw: string, label: string): number => {
    if (raw.trim() === "") {
      errors.push({ field: at(key), message: `${label} is required.` });
      return NaN;
    }
    const n = parseNumber(raw);
    if (n === null) errors.push({ field: at(key), message: `${label} must be a number.` });
    return n ?? NaN;
  };
  const optional = (key: string, raw: string, label: string, blank = 0): number =>
    raw.trim() === "" ? blank : required(key, raw, label);

  const resale = p.kind === "resale";
  // Fields a plan does not use are read quietly (the engine ignores them) so a
  // stale value can never block the result.
  const quiet = (raw: string, fallback: number) => parseNumber(raw) ?? fallback;

  // Top-up mode asks about this price, so it is required. In max mode it is
  // optional: the asking price to hold up against the maximum — never blocking.
  let price: number | null = null;
  const priceBlank = p.price.trim() === "";
  const priceN = priceBlank ? null : parseNumber(p.price);
  if (mode === "topUp") {
    if (priceN === null || priceN < 0) errors.push({ field: at("price"), message: "Enter the price to check." });
    else price = priceN;
  } else if (!priceBlank) {
    if (priceN === null || priceN < 0) soft.push({ field: at("price"), message: "Price must be a number of 0 or more." });
    else price = priceN;
  }

  const nowPct = resale ? quiet(p.nowPct, 0) : required("nowPct", p.nowPct, "Payment now");
  const allNow = !resale && nowPct >= 100;
  // Hidden for a resale and for an all-now plan: never read, never blocks.
  const planYears = resale ? quiet(p.planYears, 1) : allNow ? 1 : required("planYears", p.planYears, "Plan length");
  const downPayment = nowPct / 100;

  const schedule: CalculatorInputs["schedule"] =
    p.scheduleMode === "custom" && !resale && !allNow
      ? {
          downPayment,
          planYears,
          mode: "custom",
          // A cleared year field is a year with nothing due; the 100% check
          // says whether that adds up.
          yearShares: p.yearPcts.map((v, i) => optional(`year-${i}`, v, `Year ${i + 1} share`) / 100),
          frequency: p.frequency,
        }
      : { downPayment, planYears, mode: "equal", frequency: p.frequency };

  const purchase: PurchaseInput = {
    kind: resale ? "resale" : "developer-plan",
    discount: resale ? 0 : optional("discountPct", p.discountPct, "Discount") / 100,
    resaleRemaining: resale ? required("resaleRemaining", p.resaleRemaining, "What's still owed") : 0,
    resaleInstallments: resale ? required("resaleInstallments", p.resaleInstallments, "Installments left") : 1,
    resaleFrequency: p.resaleFrequency,
  };

  const loan: LoanInput | undefined = p.loanEnabled
    ? {
        enabled: true,
        share: required("loanSharePct", p.loanSharePct, "Loan share") / 100,
        flatRate: required("loanFlatRatePct", p.loanFlatRatePct, "Flat rate") / 100,
        years: required("loanYears", p.loanYears, "Loan length"),
        lendingRatio: required("lendingRatioPct", p.lendingRatioPct, "Lending ratio") / 100,
        certificateRate: optional("loanCertificateRatePct", p.loanCertificateRatePct, "Certificate rate") / 100,
        release: p.pledgeRelease,
      }
    : undefined;

  const inputs: CalculatorInputs = {
    ...money,
    schedule,
    maintenance: {
      share: optional("maintenancePct", p.maintenancePct, "Maintenance deposit") / 100,
      year: optional("maintenanceYear", p.maintenanceYear, "Maintenance year", 1),
    },
    finishing: {
      share: optional("finishingPct", p.finishingPct, "Finishing cost") / 100,
      year: optional("finishingYear", p.finishingYear, "Finishing year", 1),
    },
    purchase,
    ...(loan ? { loan } : {}),
  };

  let testPrice: number | null = null;
  if (p.testPrice.trim() !== "") {
    const n = parseNumber(p.testPrice);
    if (n === null) soft.push({ field: at("testPrice"), message: "Price to test must be a number." });
    else if (n < 0) soft.push({ field: at("testPrice"), message: "Price to test cannot be negative." });
    else testPrice = n;
  }

  return { inputs, errors, soft, price, testPrice };
}

export function parseForm(form: CapacityForm): ParsedForm {
  const money = parseMoney(form.money);
  const moneyErrors = [...money.errors];

  // Money's own engine checks need a plan to run against; a neutral one will do
  // because only money fields are kept from the result.
  if (moneyErrors.length === 0) {
    const probe = parsePlan(newPlan("probe"), money.base, "max").inputs;
    for (const problem of inputProblems(probe)) {
      if (problem.field === "effectiveAnnualRate") {
        const key = form.money.savingsVehicle === "certificate" ? "certificateRatePct" : "fundRatePct";
        moneyErrors.push({ field: `money.${key}`, message: problem.message });
      } else {
        const key = MONEY_ENGINE[problem.field];
        if (key) moneyErrors.push({ field: `money.${key}`, message: problem.message });
      }
    }
  }
  moneyErrors.sort((a, b) => moneyOrder(a.field.slice(6)) - moneyOrder(b.field.slice(6)));

  const softAll: FormError[] = [...money.soft];
  const cleanPlans: ParsedPlan[] = form.plans.map((plan) => {
    const parsed = parsePlan(plan, money.base, form.mode);
    softAll.push(...parsed.soft);
    const errors = [...parsed.errors];
    if (errors.length === 0 && moneyErrors.length === 0) {
      for (const problem of inputProblems(parsed.inputs)) {
        const key = PLAN_ENGINE[problem.field];
        if (key) errors.push({ field: `plan.${plan.id}.${key}`, message: problem.message });
      }
    }
    errors.sort((a, b) => planOrder(planKey(a.field)) - planOrder(planKey(b.field)));
    return {
      id: plan.id,
      inputs: errors.length === 0 && moneyErrors.length === 0 ? parsed.inputs : null,
      errors,
      price: parsed.price,
      testPrice: parsed.testPrice,
    };
  });

  const errors = [...moneyErrors, ...cleanPlans.flatMap((p) => p.errors)];
  const byField: ParsedForm["byField"] = {};
  for (const e of [...errors, ...softAll]) byField[e.field] ??= e.message;
  return { moneyErrors, plans: cleanPlans, errors, byField };
}

// ---------------------------------------------------------------------------
// Persistence: normalise whatever was stored
// ---------------------------------------------------------------------------

/** String fields that must be one of a few values; anything else falls back to the default. */
const CHOICES: Record<string, readonly string[]> = {
  savingsVehicle: ["fund", "certificate"],
  incomeFrequency: ["monthly", "yearly"],
  kind: ["developer", "resale"],
  scheduleMode: ["equal", "custom"],
  frequency: ["yearly", "quarterly", "monthly"],
  resaleFrequency: ["yearly", "quarterly", "monthly"],
  pledgeRelease: ["at-end", "gradual"],
  mode: ["max", "topUp"],
};

/** Every key of `defaults` with the right type from `src`, else the default. */
function sanitize<T extends object>(src: unknown, defaults: T, choices: Record<string, readonly string[]> = CHOICES): T {
  const from = src && typeof src === "object" ? (src as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(defaults)) {
    const def = (defaults as Record<string, unknown>)[key];
    const val = from[key];
    if (Array.isArray(def)) {
      out[key] = Array.isArray(val) && val.every((v) => typeof v === "string") ? val : def;
    } else {
      const allowed = choices[key];
      out[key] = typeof val === typeof def && (!allowed || allowed.includes(val as string)) ? val : def;
    }
  }
  return out as T;
}

const DEFAULT_RESALE_INSTALLMENTS = 4;

/** Years left on a resale, as the count of installments at a frequency; null when it is not a number. */
function installmentsFromYears(years: string, frequency: PaymentFrequency): number | null {
  const n = parseNumber(years);
  return n === null ? null : n * paymentsPerYear(frequency);
}

/** A stored plan from before installments: its `resaleYears` become a count at its frequency. */
function withInstallments(plan: unknown): unknown {
  if (!plan || typeof plan !== "object") return plan;
  const p = plan as Record<string, unknown>;
  if (typeof p.resaleInstallments === "string" || typeof p.resaleYears !== "string") return plan;
  const freq = CHOICES.resaleFrequency?.includes(p.resaleFrequency as string) ? (p.resaleFrequency as PaymentFrequency) : "yearly";
  const n = installmentsFromYears(p.resaleYears, freq);
  return { ...p, resaleInstallments: n === null ? String(DEFAULT_RESALE_INSTALLMENTS) : String(n) };
}

function normalizeV2(src: Record<string, unknown>): CapacityForm {
  const money = sanitize(src.money, DEFAULT_MONEY);

  let plans: PlanForm[] = Array.isArray(src.plans) && src.plans.length > 0
    ? src.plans.slice(0, MAX_PLANS).map((p) => sanitize(withInstallments(p), newPlan("")))
    : DEFAULT_FORM.plans;
  const seen = new Set<string>();
  const fixed: PlanForm[] = [];
  for (const p of plans) {
    let id = p.id;
    if (!/^p\d+$/.test(id) || seen.has(id)) {
      // Pick an id clear of everything kept so far AND everything still to come.
      id = planId([...fixed, ...plans.filter((q) => /^p\d+$/.test(q.id) && !seen.has(q.id) && q !== p)]);
    }
    seen.add(id);
    fixed.push({ ...p, id });
  }
  plans = fixed;

  const selectedPlanId = typeof src.selectedPlanId === "string" && plans.some((p) => p.id === src.selectedPlanId)
    ? src.selectedPlanId
    : plans[0].id;
  const step = src.step === 1 || src.step === 2 || src.step === 3 ? src.step : 1;
  const mode = src.mode === "max" || src.mode === "topUp" ? src.mode : "max";
  return {
    version: 2,
    mode,
    step,
    money,
    plans,
    selectedPlanId,
    examplesEdited: typeof src.examplesEdited === "boolean" ? src.examplesEdited : false,
  };
}

/** The version-1 form (one plan, flat), as it was stored. */
const V1_DEFAULTS = {
  currency: "EGP",
  startingCapital: "5,000,000",
  rateMode: "effective",
  effectiveRatePct: "20.33",
  nominalRatePct: "18.51",
  compounding: "365",
  planYears: "8",
  scheduleMode: "equal",
  downPaymentPct: "10",
  yearPcts: [] as string[],
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

const V1_CHOICES: Record<string, readonly string[]> = {
  ...CHOICES,
  purchaseKind: ["developer-plan", "developer-cash", "resale"],
  rateMode: ["effective", "nominal"],
  compounding: ["1", "4", "12", "365"],
};

function migrateV1(raw: Record<string, unknown>): CapacityForm {
  // Nothing of v1 in it: not a saved form at all.
  if (!Object.keys(V1_DEFAULTS).some((k) => k in raw)) return DEFAULT_FORM;
  const v = sanitize(raw, V1_DEFAULTS, V1_CHOICES);

  let fundRatePct = v.effectiveRatePct;
  if (v.rateMode === "nominal") {
    const nominal = parseNumber(v.nominalRatePct);
    const effective =
      nominal === null ? NaN : effectiveFromNominal(nominal / 100, Number(v.compounding) as CompoundingFrequency) * 100;
    fundRatePct = Number.isFinite(effective) ? effective.toFixed(2) : DEFAULT_MONEY.fundRatePct;
  }

  const money: MoneyForm = {
    currency: v.currency,
    startingCapital: v.startingCapital,
    savingsVehicle: "fund",
    fundRatePct,
    certificateRatePct: DEFAULT_MONEY.certificateRatePct,
    returnFeePct: v.returnFeePct,
    incomeAmount: v.incomeAmount,
    incomeFrequency: v.incomeFrequency as IncomeFrequency,
    incomeIncreasePct: v.incomeIncreasePct,
    safetyBuffer: v.safetyBuffer,
    keepPct: v.keepPct,
  };

  const cash = v.purchaseKind === "developer-cash";
  const plan = newPlan("p1", {
    kind: v.purchaseKind === "resale" ? "resale" : "developer",
    nowPct: cash ? "100" : v.downPaymentPct,
    discountPct: cash ? v.cashDiscountPct : "",
    planYears: v.planYears,
    scheduleMode: v.scheduleMode as PlanForm["scheduleMode"],
    yearPcts: v.yearPcts,
    frequency: v.frequency as PaymentFrequency,
    resaleRemaining: v.resaleRemaining,
    resaleInstallments: String(installmentsFromYears(v.resaleYears, v.resaleFrequency as PaymentFrequency) ?? DEFAULT_RESALE_INSTALLMENTS),
    resaleFrequency: v.resaleFrequency as PaymentFrequency,
    maintenancePct: v.maintenancePct,
    maintenanceYear: v.maintenanceYear,
    finishingPct: v.finishingPct,
    finishingYear: v.finishingYear,
    loanEnabled: v.loanEnabled,
    loanSharePct: v.loanSharePct,
    loanFlatRatePct: v.loanFlatRatePct,
    loanYears: v.loanYears,
    lendingRatioPct: v.lendingRatioPct,
    loanCertificateRatePct: v.certificateRatePct,
    pledgeRelease: v.pledgeRelease as PledgeRelease,
    loanRatesEdited: v.loanRatesEdited,
    testPrice: v.testPrice,
  });

  // A user's own form is not an example.
  return { version: 2, mode: "max", step: 1, money, plans: [plan], selectedPlanId: "p1", examplesEdited: true };
}

/**
 * Rebuild a form from whatever was persisted: a v2 form is validated field by
 * field (anything missing, mistyped or unknown falls back to the default, which
 * is what makes adding a field later safe for existing devices); a v1 form (no
 * `version`) is migrated; anything else is the defaults.
 */
export function normalizeForm(raw: unknown): CapacityForm {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_FORM;
  const src = raw as Record<string, unknown>;
  if (src.version === 2) return normalizeV2(src);
  if (src.version === undefined) return migrateV1(src);
  return DEFAULT_FORM;
}
