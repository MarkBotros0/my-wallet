# Calculator Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Real Estate calculator as money-once + several plans compared side by side, two modes (max price | yearly top-up), every money stream shown separately.

**Architecture:** The engine stays one-deal-per-call (`simulate(inputs, price)`); it gains a savings vehicle, a top-up, a discount on the developer plan, gross per-flow records and two solvers (`minTopUp`, `solvePlans`). The form becomes `{ money, plans[] }` and is parsed into one `CalculatorInputs` per plan. The page becomes three steps (Your money · Plans · Compare) with the selected plan's four result tabs under Compare.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-calculator-redesign-design.md`

## Global Constraints

- Every rate/share in the engine is a FRACTION; the UI multiplies by 100 at the edge only.
- `REFERENCE` (`src/lib/capacity/fixtures.ts`) must still solve to exactly **8,860,000**.
- Colour = the money rule: `gain` only for money in, `loss` only for money out; positions (balances, pledge held) stay neutral. Tags, not colours, mark "Best".
- Touch targets ≥ 44px; inputs `text-[16px] md:text-sm`; money inputs `NumberInput group`; `surface` / `pressable` / `btn-primary` utilities, never re-spelled.
- Sticky things read `--top-nav-clearance` / `--bottom-nav-clearance`, never restate 61/70.
- Lint rule: no synchronous setState in effects (React 19 `react-hooks/set-state-in-effect`).
- Max 6 plans, min 1. Plan field ids `plan.<id>.<field>`, money field ids `money.<field>`.
- Copy: "Fund (e.g. Thndr)", "Bank certificate", "Max price", "Yearly top-up", "Your money", "Plans", "Compare", "Where the money goes", "You end with", "Example plans — replace them with your developer's offers.".
- Never run a dev server or any script against `.env` (it is the LIVE database). Browser checks use the local Postgres container `my-wallet-pg-local` (`DATABASE_URL=postgres://postgres:local@127.0.0.1:55440/wallet`).
- Long commands (>2 min: build, dev server) run in tmux: `tmux new -d -s my-wallet-<task> "<cmd> 2>&1 | tee ~/logs/my-wallet-<task>.log"`.

## Gates between tasks

Tasks 1–3 change libraries the UI imports; the UI is rebuilt in Tasks 4–5.
Until Task 5 is done, `tsc`/`build`/`lint` may fail in `src/app/components/capacity/**`
and `src/app/real-estate/**` only. Each task's own gate is listed in it.
From Task 5 on: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all green.

## Review Focus

1. A saved version-1 form (incl. `purchaseKind: "developer-cash"` and `rateMode: "nominal"`) must open as money + one equivalent plan, not reset silently or crash.
2. Top-up mode with a plan whose price is blank or whose up-front payment exceeds savings must show a sentence (blocker), never a spinner, NaN or "0 — covered".
3. Deleting the selected plan, or the plan list arriving empty/oversized from storage, must leave a valid selection.
4. Year-by-year and "Where the money goes" must add up: start + Σin − Σout = end, with the loan shown as money in and the full up-front payment as money out.
5. Comparing plans of different lengths (100% now vs 8 years) must measure every plan to the same final date.

---

### Task 1: Engine — vehicle, discount, top-up, gross flows, plan solvers

**Files:**
- Modify: `src/lib/capacity/types.ts`, `simulate.ts`, `purchase.ts`, `solve.ts`, `index.ts`
- Test: `src/lib/capacity/simulate.test.ts`, `purchase.test.ts`, `solve.test.ts` (update existing cases that use `developer-cash`, `cashDiscount`, `YearSummary.downPayment`; add new ones)

**Interfaces — Produces (exact):**

```ts
// types.ts
export type SavingsVehicle = "fund" | "certificate";
export type PurchaseKind = "developer-plan" | "resale";          // developer-cash REMOVED
export interface PurchaseInput {
  kind: PurchaseKind;
  /** developer-plan: fraction off the list price (0 = none), in [0, 1). */
  discount: number;                                              // was cashDiscount
  resaleRemaining: number; resaleYears: number; resaleFrequency: PaymentFrequency;
}
// CalculatorInputs gains:
  savingsVehicle?: SavingsVehicle;   // absent = "fund"
  topUp?: number;                    // yearly amount on top of income; absent = 0
// InputField: "purchase.cashDiscount" -> "purchase.discount"; add "topUp"
// MonthPoint gains: topUp, upFront, loanReceived, pledged (last three non-zero at month 0 only)
// YearSummary: REMOVE downPayment; ADD upFront (gross, year 1), loanReceived (year 1), topUp
export interface FlowTotals {
  returns: number; certificateInterest: number; income: number; topUp: number;
  loanReceived: number; released: number;
  upFront: number; pledged: number; installments: number; bankInstallments: number; extraCosts: number;
}
// SimulationResult gains: startingCapital: number; totals: FlowTotals; topUp: number (the yearly top-up used)
// (keep upFront, upFrontFromFund, downPayment(=upFront) for now; UI tasks stop using downPayment)
export type Ask = { mode: "max" } | { mode: "topUp"; prices: number[] };
export type TopUpBlocker = "day-one" | "too-early";
export interface TopUpResult { topUp: number | null; simulation: SimulationResult; blocker: TopUpBlocker | null }
export interface PlanResult {
  /** max mode: the maximum price; topUp mode: the price asked about. null = nothing affordable (max mode). */
  price: number | null;
  /** topUp mode only; null in max mode or when a blocker stops it. */
  topUp: number | null;
  blocker: TopUpBlocker | null;
  simulation: SimulationResult | null;
}
```

```ts
// solve.ts
export function minTopUp(inputs: CalculatorInputs, price: number, step = DEFAULT_STEP, horizon = horizonYears(inputs)): TopUpResult;
export function commonHorizon(plans: CalculatorInputs[]): number;          // max(horizonYears(p)), ≥ 1
export function solvePlans(plans: CalculatorInputs[], ask: Ask, step = DEFAULT_STEP): PlanResult[];
export function bestPlan(results: PlanResult[], mode: Ask["mode"]): number | null; // index; max: highest price; topUp: lowest topUp; ties → first; nulls never best
export function sensitivity(inputs, deltas = DEFAULT_SENSITIVITY_DELTAS, step = DEFAULT_STEP, horizon?): SensitivityRow[]; // unchanged shape, horizon param added
export function topUpSensitivity(inputs: CalculatorInputs, price: number, deltas = DEFAULT_SENSITIVITY_DELTAS, step = DEFAULT_STEP, horizon?): { delta: number; effectiveAnnualRate: number; topUp: number | null }[];
export function compareTopUp(inputs: CalculatorInputs, price: number, step = DEFAULT_STEP, horizon = horizonYears(inputs)): { horizonYears: number; withLoan: TopUpResult; withoutLoan: TopUpResult };
// compare(...) keeps its signature and gains an optional horizon param as the 4th argument.
// withoutLoan(inputs) now ONLY sets loan.enabled = false.
```

**Behaviour (each pinned by a test):**

- [ ] **Step 1: Write failing tests** in the three test files:
  1. *Vehicle.* `{...REFERENCE, income: {amount:0,...}, maintenance share 0, safetyBuffer 0, startingCapital 1_200_000, effectiveAnnualRate 0.12}`, price 0: month-1 `returns` = 12,000 exactly for `savingsVehicle: "certificate"`; = `1_200_000 × (1.12^(1/12) − 1)` (≈ 11,387.0) for `"fund"` and for absent. `returnFee: 0.1` cuts both by 10%.
  2. *Discount.* developer-plan, discount 0.1, downPayment 0.3, planYears 6 yearly, price 10,000,000: `buildDeal` upFront 2,700,000; Σ developerDue 6,300,000 (1,050,000 at months 12…72); costBase 9,000,000. downPayment 1 → no developerDue, upFront 9,000,000.
  3. *Top-up.* yearly income: `topUp: 120_000`, annualIncrease 0.1 → months 12, 24 carry topUp 120,000 and 132,000, other months 0; monthly income → 10,000 each month of year 1, 11,000 in year 2. `topUp` absent = 0 everywhere.
  4. *Gross flows.* With a loan (share 1, lendingRatio 1, flat 0.12, 5 years, cert 0.11, at-end) on a developer plan at 5,000,000 (downPayment 0.2): month 0 `upFront` 1,000,000, `loanReceived` 1,000,000, `pledged` 1,000,000; year 1 `upFront` 1,000,000 and `loanReceived` 1,000,000.
  5. *Reconciliation.* For each of: REFERENCE at 8,860,000; developer plan + loan at-end; developer plan + loan gradual; resale (remaining 5M, 4 years quarterly) + loan; 100% now with discount; top-up 200,000 monthly income — every year satisfies `opening + returns + certificateInterest + income + topUp + loanReceived + released − upFront − pledged − installments − bankInstallments − extraCosts = closing` (to 1e-6 relative), year k+1 opening = year k closing, and `startingCapital + Σin − Σout = finalBalance` using `totals`.
  6. *REFERENCE* still → `maxFeasiblePrice(REFERENCE).maxPrice === 8_860_000`.
  7. *minTopUp.* (a) REFERENCE at 8,000,000 → topUp 0, blocker null. (b) REFERENCE with income amount 0 at 8,860,000 → topUp t with 0 < t ≤ 300,000, `t % 1000 === 0`, feasible at t, infeasible at t − 1000. (c) price whose up-front from savings exceeds capital (REFERENCE, downPayment 0.6, price 10,000,000) → topUp null, blocker "day-one". (d) REFERENCE with frequency "monthly", downPayment 0, safetyBuffer 4,999,999, price 9,600,000 (100,000 due in month 1 against ~47,400 of growth; yearly top-ups arrive at month 12) → topUp null, blocker "too-early". (e) monotonic: topUp at price p ≤ topUp at p + 500,000 for 5 prices.
  8. *solvePlans.* Two plans: REFERENCE (8 yrs) and REFERENCE with downPayment 1, discount 0.25 (horizon 8 since planYears stays 8 — also add a third with planYears 1 and downPayment 1): all simulations have `horizonYears === 8`; in max mode `price` equals `maxFeasiblePrice(plan, 1000, 8).maxPrice`; topUp mode with prices returns per-plan `minTopUp(plan, price, 1000, 8)`. `bestPlan` picks the highest price / lowest topUp; ties → first; all null → null.
  9. *Validation.* `topUp: -1` → problem field "topUp"; discount 1 → "purchase.discount"; downPayment 1 with equal mode → no problems.
- [ ] **Step 2: Run** `npx vitest run src/lib/capacity` — new tests fail.
- [ ] **Step 3: Implement.** Growth: `const growthRate = vehicle === "certificate" ? inputs.effectiveAnnualRate / 12 * (1 - returnFee) : monthlyRate(inputs.effectiveAnnualRate) * (1 - returnFee)`. Top-up per month: `topUpThisYear = (inputs.topUp ?? 0) × (1 + annualIncrease)^(year−1)`; monthly income → `/12` each month, yearly → all at m = 12; added in step 2 (income) and recorded separately. `buildDeal` developer-plan: `net = price × (1 − discount)`. `minTopUp`: if `simulate({...inputs, topUp: 0}, price).feasible` → 0; else if not feasible at topUp 1e12 → `{ topUp: null, simulation: simulate at 0, blocker: sim0.firstBreach?.month === 0 ? "day-one" : "too-early" }` (an end-shortfall-only failure is always fixable by top-ups, so it never reaches here); else bracket from `max(step, 1)` doubling, then bisect on the step grid (lo infeasible, hi feasible), return hi. Update the engine doc comments (timing rules, reconciliation, the meaning of `effectiveAnnualRate` for a certificate). Export everything new from `index.ts`.
- [ ] **Step 4: Run** `npx vitest run src/lib/capacity` — all pass. `npx tsc --noEmit -p . 2>&1 | grep "src/lib/capacity"` — empty.
- [ ] **Step 5: Commit** `Real Estate engine: savings vehicle, plan discount, yearly top-up, gross flows, plan solvers`.

**Gate:** `npx vitest run src/lib` green; no tsc errors under `src/lib`.

---

### Task 2: The form, version 2 — money once, plans as a list

**Files:**
- Rewrite: `src/app/lib/capacityForm.ts`, `src/app/lib/capacityForm.test.ts`
- Modify: `src/app/lib/capacityFormStore.ts` (same storage key `wallet.capacity.form`; `normalizeForm` does the migration)
- Delete: `src/app/lib/capacitySections.ts` + its test (sections are replaced by steps; Task 4 adds what it needs)

**Interfaces — Consumes:** Task 1's `CalculatorInputs` (`savingsVehicle`, `topUp`, `purchase.discount`, kinds `developer-plan | resale`), `inputProblems`, `effectiveFromNominal`.

**Produces (exact):**

```ts
export type Mode = "max" | "topUp";
export type Step = 1 | 2 | 3;
export const MAX_PLANS = 6;
export interface MoneyForm {
  currency: string; startingCapital: string; savingsVehicle: SavingsVehicle;
  fundRatePct: string; certificateRatePct: string; returnFeePct: string;
  incomeAmount: string; incomeFrequency: IncomeFrequency; incomeIncreasePct: string;
  safetyBuffer: string; keepPct: string;
}
export type PlanKind = "developer" | "resale";
export interface PlanForm {
  id: string; name: string; kind: PlanKind;
  price: string;                 // top-up mode: list price (developer) / cash to the seller (resale)
  discountPct: string; nowPct: string; planYears: string; scheduleMode: "equal" | "custom";
  yearPcts: string[]; frequency: PaymentFrequency;
  resaleRemaining: string; resaleYears: string; resaleFrequency: PaymentFrequency;
  maintenancePct: string; maintenanceYear: string; finishingPct: string; finishingYear: string;
  loanEnabled: boolean; loanSharePct: string; loanFlatRatePct: string; loanYears: string;
  lendingRatioPct: string; loanCertificateRatePct: string; pledgeRelease: PledgeRelease;
  loanRatesEdited: boolean; testPrice: string;
}
export interface CapacityForm {
  version: 2; mode: Mode; step: Step; money: MoneyForm; plans: PlanForm[];
  selectedPlanId: string; examplesEdited: boolean;
}
export const DEFAULT_MONEY: MoneyForm;          // currency "EGP", startingCapital "5,000,000", fund, fundRatePct "20.33", certificateRatePct "22", others blank, incomeFrequency "monthly"
export function newPlan(id: string, patch?: Partial<PlanForm>): PlanForm; // developer, "10" now, "8" years, yearly, equal, loan off with example rates "12"/"5"/"100"/"11"/at-end, maintenanceYear/finishingYear "1"
export const DEFAULT_FORM: CapacityForm;        // plans: newPlan("p1") and newPlan("p2", { nowPct: "100", discountPct: "25" }); selectedPlanId "p1"; mode "max"; step 1
export function planId(existing: PlanForm[]): string;      // "p" + (max numeric suffix + 1)
export function planName(plan: PlanForm, currency?: string): string; // plan.name.trim() || automatic name (spec): "10% now · 8 yrs", "All now · 25% off", "30% now, 10% off · 6 yrs", "Resale · 5M over 4 yrs", " + loan" appended
export function planTerms(plan: PlanForm): string;         // one line: "10% now, the rest yearly over 8 years" / "All now, 25% off" / "Pay the seller now, 5,000,000 to the developer over 4 years"
export type MoneyField = `money.${keyof MoneyForm}`;
export type PlanField = `plan.${string}.${string}`;        // plan.<id>.<PlanForm key> or plan.<id>.year-N
export type FormField = MoneyField | PlanField;
export interface FormError { field: FormField; message: string }
export interface ParsedPlan {
  id: string; inputs: CalculatorInputs | null; errors: FormError[];
  price: number | null;          // top-up mode price, parsed (null when blank/bad)
  testPrice: number | null;
}
export interface ParsedForm {
  moneyErrors: FormError[];
  plans: ParsedPlan[];
  /** All blocking errors, money first then plans in list order, each in page order. */
  errors: FormError[];
  byField: Partial<Record<FormField, string>>;
}
export function parseForm(form: CapacityForm): ParsedForm;
export function normalizeForm(raw: unknown): CapacityForm;  // v2 → validated copy; v1 (no version) → migrated; else DEFAULT_FORM
export function resizeYearPcts(current: string[], years: number): string[];
export function equalYearPcts(nowPct: number, years: number): string[];
```

Rules:
- `parseForm`: money errors block every plan (each plan's `inputs` null when money has errors). A plan with `nowPct` 100 reads `planYears` quietly (fallback 1) and forces equal mode. A resale reads the developer fields quietly. In `mode: "topUp"` a blank/invalid `price` is a blocking error on `plan.<id>.price` ("Enter the price to check."); in max mode price is ignored. `inputs.topUp` is not set by the form (the solver sets it). `effectiveAnnualRate` = fundRatePct or certificateRatePct per vehicle. Engine problems map back to fields (`purchase.discount` → `plan.<id>.discountPct`, `schedule.downPayment` → `nowPct`, `loan.certificateRate` → `loanCertificateRatePct`, `effectiveAnnualRate` → the active rate field, etc.).
- `normalizeForm` v2: unknown keys dropped, bad values → defaults per field (same approach as today's), plans array: non-array or empty → DEFAULT_FORM.plans; > 6 → first 6; duplicate/blank ids re-assigned; `selectedPlanId` not in plans → first plan's id; `step` not 1–3 → 1.
- v1 migration: money from the v1 fields (rateMode "nominal" → `fundRatePct` = effective equivalent via `effectiveFromNominal`, formatted to 2 dp); one plan `p1` named "" with: developer-plan → `nowPct` = downPaymentPct, discount ""; developer-cash → nowPct "100", discountPct = cashDiscountPct; resale → kind resale; schedule, costs, loan fields copied (certificateRatePct → loanCertificateRatePct); testPrice copied; `examplesEdited: true` (a user's own form is not an example).

- [ ] **Step 1: Write failing tests** covering: defaults parse to two valid plans; money error blocks both plans; plan error carries `plan.p2.nowPct`; custom years `plan.p1.year-1`; nowPct 100 ignores a bad planYears; top-up mode requires price; v1 migrations (installments, developer-cash 15% → nowPct 100/discount 15, nominal 18.51% daily → fundRatePct ≈ "20.33", resale with loan); normalize (empty plans, 7 plans, bad selectedPlanId, duplicate ids); `planName`/`planTerms` for the five spec examples; `planId`.
- [ ] **Step 2: Run** `npx vitest run src/app/lib/capacityForm.test.ts` — fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it — passes. `npx vitest run src/lib src/app/lib/capacityForm.test.ts` green.
- [ ] **Step 5: Commit** `Real Estate form v2: money once, plans as a list, v1 migration`.

**Gate:** the two test paths above green.

---

### Task 3: Words and the breakdown — pure

**Files:**
- Create: `src/app/lib/moneyFlow.ts` + `moneyFlow.test.ts`
- Modify: `src/app/lib/dealText.ts` + `dealText.test.ts`, `src/app/lib/yearStory.ts` (+ its test if present)

**Produces (exact):**

```ts
// moneyFlow.ts
export type FlowGroupId = "savings" | "added" | "developer" | "bank" | "costs";
export type FlowTone = "in" | "out" | "held" | "neutral";
export interface FlowRow { key: string; label: string; amount: number; tone: FlowTone }   // amount signed: + in, − out; held rows signed too (pledged −, released +)
export interface FlowGroup { id: FlowGroupId; title: string; rows: FlowRow[]; subtotal: number }
export function flowGroups(flows: FlowTotals | YearSummary, ctx: { vehicle: SavingsVehicle; kind: PurchaseKind; hasLoan: boolean; start?: number }): FlowGroup[];
export function dealBreakdown(inputs: CalculatorInputs, sim: SimulationResult): { start: number; groups: FlowGroup[]; end: number };
```

Groups and labels (zero rows dropped, empty groups dropped, order as listed):
- `savings` "Your savings": `start` "You start with" (neutral, only in `dealBreakdown`'s first group, NOT counted in subtotal), returns "Fund returns" | "Certificate interest" (in).
- `added` "What you add": income "Income" (in), topUp "Yearly top-up" (in).
- `developer` "Developer" (kind developer-plan) / "Seller and developer" (resale): upFront "Paid now" (out; resale: "Cash to the seller"), installments "Installments" (out; resale: "Developer installments").
- `bank` "Bank loan": loanReceived "Loan received" (in), bankInstallments "Bank installments" (out), pledged "Locked as guarantee" (held, −), released "Guarantee returned" (held, +), certificateInterest "Interest on the guarantee" (in).
- `costs` "Extra costs": extraCosts "Maintenance and finishing" (out).
- `start + Σ subtotals = end` exactly (test it on the reconciliation scenarios from Task 1).

dealText:
- `describeDeal` drops `developer-cash`; the first sentence for a developer plan: 100% now with discount → "You pay the developer # today (the whole price after 25% off), from savings."; with now < 100 → "You pay the developer # today (30% of the price after 10% off), from savings." (no discount → "(10% of the price)"). With a loan: "… today — # from the bank, # from savings." Keep the pledge, installments and costs sentences.
- New `topUpSentence(result: TopUpResult, currency: string, incomeFrequency): DealSentence` — 0: "Your savings and income already carry this plan — no top-up needed."; > 0: "Add # a year on top of your income (#/month)" (the per-month part only when income is monthly), "growing with your raise" when annualIncrease > 0; blocker day-one: "No top-up can fix this: on day one you need # more savings than you have." (amount = `firstBreach.shortfall`); too-early: "No top-up can fix this: a payment in month N comes before the first top-up arrives."
- `loanVerdict` keeps working with `compare` (max mode); add `loanVerdictTopUp(cmp)` → "Without the loan you'd add # a year less/more." headline.
- yearStory: replace `y.downPayment` with `y.upFront`; "paid" includes the full up-front payment; the loan received counts as covered-by.

- [ ] **Step 1: Write failing tests** for every label/group rule above, the reconciliation identity, and each sentence.
- [ ] **Step 2: Run** — fails. **Step 3: Implement.** **Step 4: Run** `npx vitest run src/lib src/app/lib` — green (all app/lib tests, incl. Task 2's).
- [ ] **Step 5: Commit** `Real Estate words: where the money goes, top-up sentences`.

**Gate:** `npx vitest run src/lib src/app/lib` green.

---

### Task 4: The page shell, step ① Your money and step ② Plans

**Files:**
- Rewrite: `src/app/components/capacity/CapacityCalculator.tsx` (shell: header, mode switch, step bar, steps, sticky strip)
- Create: `StepBar.tsx`, `MoneyStep.tsx`, `PlansStep.tsx`, `PlanEditor.tsx`, `PlanCard.tsx`, `src/app/lib/usePlanResults.ts` (hook: parsed form → `solvePlans` results, memoised on the parsed inputs; returns `{ parsed, results, best, horizon }`)
- Adapt/reuse: `LoanCard.tsx` (takes a `PlanForm` + `onChange(patch)`), `ScheduleEditor.tsx` (plan-scoped: nowPct, years, frequency, custom split; hides length when nowPct is 100), `formErrors.tsx` (field ids are now strings `money.*` / `plan.<id>.*`; keep `useVisibleErrors` behaviour), `Section.tsx` (may be reused inside the plan editor), `LiveResult.tsx` (shows the selected plan's answer in either mode; tap → step 3)
- Delete: `PurchasePicker.tsx`, `RateInput.tsx` (replaced by the vehicle switch + one rate field)

**Behaviour:**
- Mode switch (`Segmented`): "Max price" | "Yearly top-up". Step bar: three 44px buttons "1 Your money", "2 Plans", "3 Compare", current `aria-current="step"`, red dot when a field in that step has a visible error. Next/Back buttons at the foot of steps 1–2 (`btn-primary` for Next). Changing step scrolls to the top of the calculator (respecting reduced motion).
- Step ①: the four groups from the spec, each a `surface` card with a short title and one-line hints. Vehicle switch "Fund (e.g. Thndr)" | "Bank certificate"; the rate field label follows it ("Yearly return" / "Certificate rate, paid monthly") with hints "What the fund earned over a year, after its own fees." / "The rate the bank quotes; interest is paid every month." Fees field label "Fees or tax on returns".
- Step ②: the "Example plans — replace them with your developer's offers." note while `!examplesEdited`. Each `PlanCard`: name (`planName`), `planTerms`, live answer (max price, or top-up / "covered" / "Can't work" in top-up mode, "Nothing affordable" when null), Edit (expands `PlanEditor` inline; one open at a time), Duplicate (copies, new id, name + " (copy)" if named), Delete (not on the last; deleting the selected plan selects the first remaining). "Add a plan" (hidden at 6) adds `newPlan(planId(plans))` and opens it. Any plan field edit sets `examplesEdited`.
- `PlanEditor`: optional name input (placeholder = automatic name) · "Buying from" Developer | Resale · developer: Discount %, Paid now % (with the computed "You pay X now, Y over the plan" line in top-up mode when the price is set), "The rest is paid over" (hidden at 100%) → years + frequency + "Set each year's share" (custom split) · resale: Cash to the seller (top-up mode only; in max mode a line says "The calculator finds the most you can pay the seller."), What's still owed to the developer, Years left, How often · developer in top-up mode: "Price" (list price) · Bank loan (toggle + LoanCard) · Extra costs (maintenance %, year; finishing %, year).
- Errors: inline under each field (existing `CalcField` pattern with the new ids); the step bar dot; the sticky strip "N inputs need fixing" + Fix → goes to the step, opens the plan editor, focuses the field.
- State: everything persists through `useCapacityForm` (step, mode, selection, plans).

- [ ] **Step 1:** Build the components above; wire the hook to `solvePlans` (max mode: `{ mode: "max" }`; top-up mode: prices from the parsed plans — a plan without a valid price shows "Enter a price" instead of solving).
- [ ] **Step 2:** Step ③ placeholder for now: a list of `PlanCard`s in read-only form (Task 5 replaces it).
- [ ] **Step 3:** `npx vitest run` green; `npx tsc --noEmit` errors only in files Task 5 rewrites (`BalanceChart`, `YearTable`, `SensitivityTable`, `LoanComparison`, `DealSummary`, `Explain`, `ResultTabs` usage) — list them in the report.
- [ ] **Step 4: Commit** `Real Estate: three steps — your money, plans`.

---

### Task 5: Step ③ Compare and the four result tabs

**Files:**
- Create: `CompareStep.tsx`, `PlanRanking.tsx`, `MoneyFlowList.tsx` (renders `FlowGroup[]`)
- Rewrite/adapt: `ResultTabs.tsx` (keep the ARIA tablist), `YearTable.tsx` (grouped by `flowGroups(year)`), `BalanceChart.tsx` (gross month-0 annotation: "Start 5M · paid now −824K" / with a loan "+ loan 1M, guarantee locked 1M"; pledge held as a muted area; tooltip flows grouped by heading), `SensitivityTable.tsx` (mode-aware), `LoanComparison.tsx` (mode-aware, labels "With the loan" / "Without the loan"), `DealSummary.tsx` (uses `describeDeal` / `topUpSentence`), `LiveResult.tsx` / `DesktopResultBar` (selected plan, both modes), `Explain.tsx` (keep only if still referenced)

**Behaviour:**
- `PlanRanking`: one row per plan in list order, each a 44px+ button: name, terms line, answer, "Best" tag on `bestPlan`; selected row has the accent border; `aria-pressed`. A plan with errors shows "Fix this plan" and selecting it goes to step ② with its editor open.
- Detail under the ranking (beside it from `lg:`): the four tabs for the selected plan.
  - **Answer**: hero — max mode "Most you can pay" + price (resale: "Most you can pay the seller") with "Over N years, never below <buffer>" caption; top-up mode "Add each year" + amount, or "0" + "You're already covered", or the blocker sentence in `loss`. Then "Where the money goes" (`MoneyFlowList` of `dealBreakdown`): "You start with", groups with subtotals, "You end with" — signed amounts, `gain` for in, `loss` for out, neutral for held. Then "Your deal" sentences.
  - **Over time**: the chart for the selected plan's simulation.
  - **Year by year**: phone — one card per year: Opening, then each group's rows and subtotal, then Closing, Lowest; desktop — a table with one column per group subtotal (Savings, Added, Developer, Bank, Costs) plus Opening/Closing/Lowest, rows expandable to the line items. Breached years tinted `loss`.
  - **What if**: "If the return changes" (`sensitivity` or `topUpSensitivity` at the plan's price), "With and without the loan" (only when the plan's loan is on; `compare` or `compareTopUp`), "Check a price" (max mode; the plan's `testPrice`).
- All simulations of the compare view use `commonHorizon` (from `usePlanResults`).
- Nothing affordable / blocked / plan invalid: Over time and Year by year say so in one line.

- [ ] **Step 1:** Build. **Step 2:** `npm test`, `npx tsc --noEmit`, `npm run lint` all green; remove dead components/exports (grep for imports). **Step 3: Commit** `Real Estate: compare plans, where the money goes, grouped years`.

---

### Task 6: Docs, full verification, browser check

**Files:** `CLAUDE.md` (the Real Estate section: replace "Buying three ways" table + "The page's shape" with the new model, steps, modes, flow groups; update the layout tree file list; test count), `docs/superpowers/specs/2026-10-12-bank-loan-and-resale-design.md` (one line at the top: "Screen superseded by 2026-10-13-calculator-redesign-design.md").

- [ ] **Step 1:** Update the docs.
- [ ] **Step 2:** `npm test`, `npm run lint`, and the build in tmux (`tmux kill-session -t my-wallet-dev` first; `tmux new -d -s my-wallet-build "cd /home/mark/projects/my-wallet && npm run build 2>&1 | tee ~/logs/my-wallet-build.log"`), all green.
- [ ] **Step 3:** Restart the dev server against the LOCAL db only: `tmux new -d -s my-wallet-dev "cd /home/mark/projects/my-wallet && DATABASE_URL=postgres://postgres:local@127.0.0.1:55440/wallet npm run dev 2>&1 | tee ~/logs/my-wallet-dev.log"`; log in as `sdd-check` / `local-check-2` with a playwright-core script (chromium) and screenshot at 390px and 1280px: each step, both modes, a plan with a loan on Answer / Year by year, a resale plan, a v1 form planted in localStorage (`wallet.capacity.form`) migrating. Save screenshots to the scratchpad.
- [ ] **Step 4: Commit** `Docs: the calculator redesign`.
