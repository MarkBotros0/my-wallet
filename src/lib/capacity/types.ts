/**
 * Installment buying-capacity calculator — the shared vocabulary.
 *
 * This module (src/lib/capacity) is pure: no React, no Next, no database. The
 * UI converts what the user typed into these shapes and formats what comes
 * back; every number in here follows two conventions, so the maths never has
 * to guess:
 *
 *   - Every rate and percentage is a FRACTION. 20.33% is 0.2033, a 10% down
 *     payment is 0.10. The UI multiplies by 100 at the edge and nowhere else.
 *   - Every amount is in the user's currency, as a plain number.
 */

/** Compounding periods per year for a nominal rate. */
export type CompoundingFrequency = 1 | 4 | 12 | 365;

/** How many installments a year's share of the price is split into. */
export type PaymentFrequency = "yearly" | "quarterly" | "monthly";

export type IncomeFrequency = "monthly" | "yearly";

export interface ScheduleInput {
  /** Fraction of the price paid at month 0. */
  downPayment: number;
  /** Installment period in whole years, 1–15. */
  planYears: number;
  /**
   * "equal"  — the remainder (1 − downPayment) is split evenly across years.
   * "custom" — `yearShares[i]` is year i+1's fraction of the price; together
   *            with the down payment they must sum to exactly 1.
   */
  mode: "equal" | "custom";
  yearShares?: number[];
  /** Within a year, its share is split equally across these payments. */
  frequency: PaymentFrequency;
}

export interface IncomeInput {
  amount: number;
  frequency: IncomeFrequency;
  /** Fraction by which the amount grows each year (0 = flat). */
  annualIncrease: number;
}

/** A one-off cost expressed as a fraction of the price, due at the END of `year`. */
export interface ExtraCost {
  share: number;
  year: number;
}

/** How the property is bought — what the up-front payment is and what is owed after it. */
export type PurchaseKind = "developer-plan" | "resale";

/**
 * Where the savings sit. A "fund" compounds: `effectiveAnnualRate` is its
 * effective yearly yield. A "certificate" pays its quoted annual rate in
 * monthly instalments (rate / 12) — `effectiveAnnualRate` then holds that
 * quoted rate, and growth is simple monthly interest, not compounding.
 */
export type SavingsVehicle = "fund" | "certificate";

export interface PurchaseInput {
  kind: PurchaseKind;
  /**
   * developer-plan: fraction off the LIST price (0 = none), in [0, 1). The
   * price asked about stays the list price, so plans' maxima compare.
   */
  discount: number;
  /** resale: what the seller still owes the developer — a fixed amount, never scaled by price. */
  resaleRemaining: number;
  /** resale: whole years left on that balance, 1–15; split equally. */
  resaleYears: number;
  resaleFrequency: PaymentFrequency;
}

/** When the bank hands the pledged certificates back. */
export type PledgeRelease = "at-end" | "gradual";

/**
 * A bank loan secured by certificates: the bank lends `lendingRatio` of the
 * pledge, the pledge stays locked earning `certificateRate`, and the loan is
 * repaid monthly at a FLAT rate (interest on the original amount every year).
 */
export interface LoanInput {
  enabled: boolean;
  /** Fraction of the up-front payment borrowed. */
  share: number;
  /** Flat annual rate. */
  flatRate: number;
  /** Whole years 1–15, repaid monthly. */
  years: number;
  /** Loan ÷ pledge; 1 = the bank lends 100% of the certificates. */
  lendingRatio: number;
  /** Annual rate the pledged certificates pay, net of tax, paid monthly (rate / 12). */
  certificateRate: number;
  release: PledgeRelease;
}

export interface CalculatorInputs {
  startingCapital: number;
  /**
   * Effective annual yield of the fund, as a fraction — or, for
   * `savingsVehicle: "certificate"`, the certificate's quoted annual rate.
   */
  effectiveAnnualRate: number;
  /** Where the savings sit. Absent = "fund". */
  savingsVehicle?: SavingsVehicle;
  /**
   * A yearly amount added on top of income, with income's frequency (monthly:
   * topUp / 12 every month; yearly: at months 12, 24, …) and growing by
   * `income.annualIncrease`. Absent = 0.
   */
  topUp?: number;
  schedule: ScheduleInput;
  income: IncomeInput;
  /** Maintenance deposit — `share: 0` disables it. */
  maintenance: ExtraCost;
  /** Finishing cost — `share: 0` disables it. */
  finishing: ExtraCost;
  /** The balance must never drop below this. */
  safetyBuffer: number;
  /** Fraction of each period's fund return lost to fees/taxes (0 = none). */
  returnFee: number;
  /**
   * Share of the STARTING capital that must still be in the fund when the
   * plan ends — "keep 30% of my savings" — as a fraction. 0 = no requirement.
   */
  minKeptShare: number;
  /** How the property is bought. Absent = developer installments (the original calculator). */
  purchase?: PurchaseInput;
  /** A bank loan for part of the up-front payment. Absent or `enabled: false` = no loan. */
  loan?: LoanInput;
}

/**
 * Which input a validation problem is about — a path into CalculatorInputs.
 * The form maps these onto its own fields so a message can sit beside the
 * input it names instead of in a list somewhere else.
 */
export type InputField =
  | "startingCapital"
  | "effectiveAnnualRate"
  | "safetyBuffer"
  | "returnFee"
  | "minKeptShare"
  | "income.amount"
  | "income.annualIncrease"
  | "schedule.planYears"
  | "schedule.downPayment"
  | "schedule.yearShares"
  | "maintenance.share"
  | "maintenance.year"
  | "finishing.share"
  | "finishing.year"
  | "topUp"
  | "purchase.discount"
  | "purchase.resaleRemaining"
  | "purchase.resaleYears"
  | "loan.share"
  | "loan.flatRate"
  | "loan.years"
  | "loan.lendingRatio"
  | "loan.certificateRate";

export interface InputProblem {
  field: InputField;
  message: string;
}

export interface MonthPoint {
  /** 0 = right after the up-front payment (and the pledge); 1..12·years thereafter. */
  month: number;
  /** The SPENDABLE fund — pledged certificates are in `held`, not here. */
  balance: number;
  /**
   * What moved the balance THIS month. At month 0 only `upFront`,
   * `loanReceived` and `pledged` are non-zero.
   * `balance = previous + returns + certificateInterest + income + topUp
   *  − installment − extraCost − bankInstallment + released`.
   * Month 0 is `startingCapital + loanReceived − upFront − pledged`.
   */
  returns: number;
  income: number;
  /** The yearly top-up's part of this month (separate from `income`). */
  topUp: number;
  /** Month 0 only: the gross up-front payment, the loan received, the pledge locked. */
  upFront: number;
  loanReceived: number;
  pledged: number;
  /** Developer installment (the plan's, or the seller's remaining balance). */
  installment: number;
  extraCost: number;
  certificateInterest: number;
  bankInstallment: number;
  /** Pledge handed back this month. */
  released: number;
  /** Pledge still locked at the end of the month. */
  held: number;
}

/**
 * One year of the plan as a ledger row. Every row reconciles:
 * `opening + returns + certificateInterest + income + topUp + loanReceived + released − upFront − pledged − installments − bankInstallments − extraCosts = closing`.
 * `upFront` is the GROSS up-front payment and `loanReceived` the part of it
 * the bank lent. The up-front payment is a YEAR-1 flow: year 1 opens
 * on the starting capital (before the payment) so the reader sees where they
 * actually began; every later year opens on the previous closing.
 */
export interface YearSummary {
  year: number;
  opening: number;
  /** The gross up-front payment, year 1 only; 0 after. */
  upFront: number;
  /** The part of it the bank lent, year 1 only; 0 after. */
  loanReceived: number;
  returns: number;
  income: number;
  topUp: number;
  installments: number;
  extraCosts: number;
  /** Locked as the bank's guarantee — year 1 only. */
  pledged: number;
  released: number;
  certificateInterest: number;
  bankInstallments: number;
  closing: number;
  /**
   * Lowest end-of-month balance seen during the year. Year 1 includes the
   * balance right after the down payment (month 0), since that payment is
   * this row's.
   */
  lowest: number;
  breached: boolean;
}

export interface LoanSummary {
  amount: number;
  pledge: number;
  months: number;
  monthlyInstallment: number;
  totalInterest: number;
  /** The nominal annual rate a normal (declining-balance) loan would need for the same installment. */
  equivalentDecliningRate: number;
  /** What the pledged certificates paid over the loan. */
  certificateInterest: number;
  /** totalInterest − certificateInterest: what the loan really cost. */
  netCost: number;
}

/** Every flow summed over the deal; the whole deal reconciles through these. */
export interface FlowTotals {
  returns: number;
  certificateInterest: number;
  income: number;
  topUp: number;
  loanReceived: number;
  released: number;
  upFront: number;
  pledged: number;
  installments: number;
  bankInstallments: number;
  extraCosts: number;
}

export interface SimulationResult {
  price: number;
  feasible: boolean;
  startingCapital: number;
  /** The yearly top-up this run used (0 when none). */
  topUp: number;
  /** `startingCapital + Σin − Σout = finalBalance`, from these. */
  totals: FlowTotals;
  upFront: number;
  /** The part of `upFront` paid from the fund — the rest is the loan. */
  upFrontFromFund: number;
  /** Everything owed to the developer after the up-front payment, excluding extra costs. */
  totalInstallments: number;
  totalExtraCosts: number;
  finalBalance: number;
  minBalance: number;
  /** The first month the balance dropped below the buffer, if it ever did. */
  firstBreach: { month: number; shortfall: number } | null;
  /** Set when the plan ends below the keep target (target = minKeptShare × capital). */
  endShortfall: { target: number; shortfall: number } | null;
  /** Down payment + installments + extra costs: what left the fund for the property. */
  paidIntoProperty: number;
  /** What is still in the fund when the plan ends — the final balance, named for the reader. */
  keptInFund: number;
  /** keptInFund as a share of the starting capital. */
  keptShareOfCapital: number;
  totalCertificateInterest: number;
  loan: LoanSummary | null;
  /** Years simulated: the longer of the developer stream and the loan (or the horizon asked for). */
  horizonYears: number;
  monthly: MonthPoint[];
  years: YearSummary[];
}

export interface CapacityResult {
  /** Largest feasible price at the requested step, or null if nothing is affordable. */
  maxPrice: number | null;
  /** The simulation at `maxPrice`, for the tables and chart. */
  simulation: SimulationResult | null;
}

/** The deal with its loan against the same purchase without one, over one horizon. */
export interface Comparison {
  horizonYears: number;
  withLoan: CapacityResult;
  withoutLoan: CapacityResult;
  /** Both sides at the price being checked, when there is one. */
  tested: { withLoan: SimulationResult; withoutLoan: SimulationResult } | null;
}

export interface SensitivityRow {
  /** The effective annual rate this row was solved at. */
  effectiveAnnualRate: number;
  /** Difference from the current rate (e.g. -0.03). */
  delta: number;
  maxPrice: number | null;
}

/** What the user asks of a set of plans. */
export type Ask = { mode: "max" } | { mode: "topUp"; prices: number[] };

/** Why a top-up cannot make a price work: it is due before any top-up can help. */
export type TopUpBlocker = "day-one" | "too-early";

export interface TopUpResult {
  /** The least yearly top-up that makes the price feasible; null when none can. */
  topUp: number | null;
  /** The run at that top-up; at top-up 0 when `topUp` is null. */
  simulation: SimulationResult;
  blocker: TopUpBlocker | null;
}

export interface PlanResult {
  /** max mode: the maximum price; topUp mode: the price asked about. null = nothing affordable (max mode), or no price given (top-up mode). */
  price: number | null;
  /** topUp mode only; null in max mode or when a blocker stops it. */
  topUp: number | null;
  blocker: TopUpBlocker | null;
  simulation: SimulationResult | null;
}
