# Bank Loan, Cash Purchase and Resale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Real Estate buying-capacity calculator with three ways of buying (developer installments, developer cash with a discount, resale) and an optional bank loan secured by pledged certificates, with a with/without-loan comparison and a plain-language read-back.

**Architecture:** The pure engine in `src/lib/capacity` is generalised, not duplicated: every deal is an up-front payment at month 0 plus an optional developer payment stream, and an optional loan that funds part of the up-front payment while a pledge sits locked earning a certificate rate. `purchase.ts` builds the deal, `loan.ts` holds the flat-loan maths, `simulate.ts` walks the months (spendable balance + held pledge), `solve.ts` gains a horizon and `compare`. The form layer (`capacityForm.ts`) gains string fields, and `dealText.ts` turns results into sentences. UI components consume those.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-bank-loan-and-resale-design.md` — read it before starting any task.

## Global Constraints

- Every rate and share in `src/lib/capacity` is a FRACTION; amounts are plain numbers. The UI multiplies by 100 at the edge only.
- `src/lib/capacity` stays pure: no React, no Next, no DB imports.
- The reference scenario (`fixtures.ts`, developer plan, loan off) must still solve to **8,860,000** with final balance 500,991 — never edit `REFERENCE`.
- `isFeasible` stays `simulate(...).feasible`. No second walk.
- `gain` = money in, `loss` = money out, never decoration. Pledged/locked money and comparisons are positions: white/muted.
- Touch targets `min-h-[44px]`; inputs keep `text-[16px] md:text-sm`; money inputs use `NumberInput group`.
- Every animation already respects reduced motion via the base layer; do not add per-component checks.
- Lint rules: no synchronous `setState` in an effect body; adjust-during-render or `useSyncExternalStore` instead.
- Certificate interest = `held × certificateRate / 12` per month, net (no `returnFee`).
- Equivalent declining rate is NOMINAL annual (monthly rate × 12).
- Commands: `npm test` (Vitest), `npm run lint`, `npm run build` — run from `/home/mark/projects/my-wallet`. Any command likely over ~2 minutes (build, dev server) runs in tmux: `tmux new -d -s my-wallet-<task> "<cmd> 2>&1 | tee ~/logs/my-wallet-<task>.log"`.
- Commits end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ
  ```

## Review Focus

1. **A device with a saved pre-loan form** — opens on developer installments, loan off, same numbers as before (Task 5 test: `normalizeForm` of an old object).
2. **A corrupted/unknown `purchaseKind` or `pledgeRelease` in localStorage** — falls back to the default instead of crashing a `switch` (Task 5 test).
3. **Resale with hidden, invalid plan fields** (e.g. plan years blank from earlier editing) — must not block the result or show errors for fields the user cannot see (Task 5 test).
4. **Loan longer than the developer plan** (loan 10 years, plan 4) — horizon extends, extra-cost years up to the horizon are valid, the without-loan side is simulated over the same 10 years (Tasks 3 and 4 tests).
5. **Pledge larger than the savings** (lending ratio 50%, borrow 100%) — infeasible at month 0 with the "guarantee plus your share" message, not a negative balance shown as affordable (Task 3 test + Task 9 verdict copy).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/capacity/types.ts` (modify) | New input types, output fields, `Comparison` |
| `src/lib/capacity/purchase.ts` (create) | Defaults, `purchaseOf`, `activeLoan`, `horizonYears`, `buildDeal`, `purchaseProblems` |
| `src/lib/capacity/loan.ts` (create) | `loanTerms`, `pledgeHeld`, `decliningRateFromFlat`, `loanProblems` |
| `src/lib/capacity/simulate.ts` (modify) | Month walk with pledge and loan; validation wiring |
| `src/lib/capacity/solve.ts` (modify) | Horizon parameter; `withoutLoan`, `compare` |
| `src/lib/capacity/index.ts` (modify) | Exports |
| `src/app/lib/capacityForm.ts` (modify) | New form fields, parsing, defaults, enum-safe normalising |
| `src/app/lib/dealText.ts` (create) | `describeDeal`, `loanVerdict` — pure, tested |
| `src/app/components/capacity/PurchasePicker.tsx` (create) | "How are you buying?" cards + per-kind fields |
| `src/app/components/capacity/LoanCard.tsx` (create) | Loan switch, fields, read-backs, bank terms, glossary |
| `src/app/components/capacity/Explain.tsx` (create) | The "What's this?" disclosure |
| `src/app/components/capacity/DealSummary.tsx` (create) | "Your deal" sentences |
| `src/app/components/capacity/LoanComparison.tsx` (create) | Verdict + with/without table |
| `src/app/components/capacity/CapacityCalculator.tsx` (modify) | Wiring, plan card per kind, check-this-deal, hero copy |
| `src/app/components/capacity/LiveResult.tsx` (modify) | Loan difference beside the max |
| `src/app/components/capacity/YearTable.tsx` (modify) | Bank group / columns |
| `src/app/components/capacity/BalanceChart.tsx` (modify) | Held line, release label, tooltip flows, stream frequency |
| `CLAUDE.md` (modify) | Document the feature |

---

### Task 1: Types and the purchase model

**Files:**
- Modify: `src/lib/capacity/types.ts`
- Create: `src/lib/capacity/purchase.ts`
- Test: `src/lib/capacity/purchase.test.ts`

**Interfaces:**
- Consumes: `buildInstallmentShares`, `MIN_PLAN_YEARS`, `MAX_PLAN_YEARS` from `schedule.ts`.
- Produces:
  - types `PurchaseKind`, `PurchaseInput`, `PledgeRelease`, `LoanInput`, `LoanSummary`, `Comparison`; `CalculatorInputs.purchase?`, `CalculatorInputs.loan?`; new `InputField` members; new `MonthPoint`, `YearSummary`, `SimulationResult` fields.
  - `DEFAULT_PURCHASE: PurchaseInput`
  - `purchaseOf(inputs: CalculatorInputs): PurchaseInput`
  - `activeLoan(inputs: CalculatorInputs): LoanInput | null`
  - `developerYears(inputs: CalculatorInputs): number`
  - `horizonYears(inputs: CalculatorInputs): number`
  - `interface Deal { upFront: number; developerDue: number[]; costBase: number }`
  - `buildDeal(inputs: CalculatorInputs, price: number, horizon: number): Deal`
  - `purchaseProblems(inputs: CalculatorInputs): InputProblem[]`

- [ ] **Step 1: Add the types**

In `src/lib/capacity/types.ts`, after `ExtraCost`, add:

```ts
/** How the property is bought — what the up-front payment is and what is owed after it. */
export type PurchaseKind = "developer-plan" | "developer-cash" | "resale";

export interface PurchaseInput {
  kind: PurchaseKind;
  /** developer-cash: fraction off the installment price for paying it all now. */
  cashDiscount: number;
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
```

Add to `CalculatorInputs` (after `minKeptShare`):

```ts
  /** How the property is bought. Absent = developer installments (the original calculator). */
  purchase?: PurchaseInput;
  /** A bank loan for part of the up-front payment. Absent or `enabled: false` = no loan. */
  loan?: LoanInput;
```

Extend `InputField` with:

```ts
  | "purchase.cashDiscount"
  | "purchase.resaleRemaining"
  | "purchase.resaleYears"
  | "loan.share"
  | "loan.flatRate"
  | "loan.years"
  | "loan.lendingRatio"
  | "loan.certificateRate"
```

Replace the `MonthPoint` interface with:

```ts
export interface MonthPoint {
  /** 0 = right after the up-front payment (and the pledge); 1..12·years thereafter. */
  month: number;
  /** The SPENDABLE fund — pledged certificates are in `held`, not here. */
  balance: number;
  /**
   * What moved the balance THIS month. All zero at month 0 — the up-front
   * payment and the pledge are on the result, not on the point.
   * `balance = previous + returns + certificateInterest + income − installment
   *  − extraCost − bankInstallment + released`.
   */
  returns: number;
  income: number;
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
```

Add to `YearSummary` (after `extraCosts`), and update its doc comment's equation to
`opening + returns + certificateInterest + income + released − downPayment − pledged − installments − bankInstallments − extraCosts = closing`
and note that `downPayment` is the part of the up-front payment that came from the fund:

```ts
  /** Locked as the bank's guarantee — year 1 only. */
  pledged: number;
  released: number;
  certificateInterest: number;
  bankInstallments: number;
```

Add before `SimulationResult`:

```ts
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
```

In `SimulationResult`, change the `downPayment` comment to `/** The whole up-front payment at month 0 (the down payment, the cash price, or the cash to the seller). */` and add:

```ts
  upFront: number;
  /** The part of `upFront` paid from the fund — the rest is the loan. */
  upFrontFromFund: number;
  totalCertificateInterest: number;
  loan: LoanSummary | null;
  /** Years simulated: the longer of the developer stream and the loan (or the horizon asked for). */
  horizonYears: number;
```

Change `totalInstallments`'s comment to `/** Everything owed to the developer after the up-front payment, excluding extra costs. */`.

At the end of the file add:

```ts
/** The deal with its loan against the same purchase without one, over one horizon. */
export interface Comparison {
  horizonYears: number;
  withLoan: CapacityResult;
  withoutLoan: CapacityResult;
  /** Both sides at the price being checked, when there is one. */
  tested: { withLoan: SimulationResult; withoutLoan: SimulationResult } | null;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/capacity/purchase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { REFERENCE } from "./fixtures";
import { activeLoan, buildDeal, horizonYears, purchaseOf, purchaseProblems } from "./purchase";
import type { CalculatorInputs, LoanInput, PurchaseInput } from "./types";

const LOAN: LoanInput = {
  enabled: true,
  share: 0.9,
  flatRate: 0.12,
  years: 5,
  lendingRatio: 1,
  certificateRate: 0.11,
  release: "at-end",
};
const RESALE: PurchaseInput = {
  kind: "resale",
  cashDiscount: 0,
  resaleRemaining: 5_000_000,
  resaleYears: 4,
  resaleFrequency: "yearly",
};
const withInputs = (over: Partial<CalculatorInputs>): CalculatorInputs => ({ ...REFERENCE, ...over });
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

describe("purchaseOf / activeLoan", () => {
  it("treats inputs without a purchase as developer installments, and no loan", () => {
    expect(purchaseOf(REFERENCE).kind).toBe("developer-plan");
    expect(activeLoan(REFERENCE)).toBeNull();
  });
  it("ignores a loan that is switched off", () => {
    expect(activeLoan(withInputs({ loan: { ...LOAN, enabled: false } }))).toBeNull();
    expect(activeLoan(withInputs({ loan: LOAN }))).toEqual(LOAN);
  });
});

describe("horizonYears", () => {
  it("is the plan's years with no loan", () => {
    expect(horizonYears(REFERENCE)).toBe(8);
  });
  it("is the longer of the developer stream and the loan", () => {
    expect(horizonYears(withInputs({ loan: { ...LOAN, years: 10 } }))).toBe(10);
    expect(horizonYears(withInputs({ loan: { ...LOAN, years: 3 } }))).toBe(8);
  });
  it("uses the resale's remaining years for a resale", () => {
    expect(horizonYears(withInputs({ purchase: RESALE }))).toBe(4);
    expect(horizonYears(withInputs({ purchase: RESALE, loan: LOAN }))).toBe(5);
  });
});

describe("buildDeal", () => {
  it("developer plan: the down payment up front, the rest of the price on the plan", () => {
    const d = buildDeal(REFERENCE, 8_000_000, 8);
    expect(d.upFront).toBe(800_000);
    expect(sum(d.developerDue)).toBeCloseTo(7_200_000, 6);
    expect(d.developerDue[12]).toBeCloseTo(900_000, 6);
    expect(d.costBase).toBe(8_000_000);
  });
  it("developer cash: the discounted price up front, nothing after, costs on the cash price", () => {
    const inputs = withInputs({ purchase: { ...RESALE, kind: "developer-cash", cashDiscount: 0.3 } });
    const d = buildDeal(inputs, 10_000_000, 8);
    expect(d.upFront).toBeCloseTo(7_000_000, 6);
    expect(sum(d.developerDue)).toBe(0);
    expect(d.costBase).toBeCloseTo(7_000_000, 6);
  });
  it("resale: the price is the cash to the seller; the remaining balance is fixed and spread over its years", () => {
    const inputs = withInputs({ purchase: RESALE });
    const a = buildDeal(inputs, 10_000_000, 4);
    const b = buildDeal(inputs, 20_000_000, 4);
    expect(a.upFront).toBe(10_000_000);
    expect(sum(a.developerDue)).toBeCloseTo(5_000_000, 6);
    expect(sum(b.developerDue)).toBeCloseTo(5_000_000, 6);
    expect(a.developerDue[12]).toBeCloseTo(1_250_000, 6);
    expect(a.costBase).toBe(15_000_000);
  });
  it("pads the developer stream with zeros out to a longer horizon", () => {
    const d = buildDeal(REFERENCE, 8_000_000, 10);
    expect(d.developerDue).toHaveLength(121);
    expect(d.developerDue[120]).toBe(0);
  });
});

describe("purchaseProblems", () => {
  it("accepts the defaults and a sound resale", () => {
    expect(purchaseProblems(REFERENCE)).toEqual([]);
    expect(purchaseProblems(withInputs({ purchase: RESALE }))).toEqual([]);
  });
  it("rejects a cash discount of 100% or more, or below 0", () => {
    for (const cashDiscount of [1, 1.2, -0.1]) {
      const fields = purchaseProblems(withInputs({ purchase: { ...RESALE, kind: "developer-cash", cashDiscount } })).map(
        (p) => p.field,
      );
      expect(fields).toEqual(["purchase.cashDiscount"]);
    }
  });
  it("rejects a negative remaining balance and years outside 1–15 for a resale only", () => {
    const fields = purchaseProblems(
      withInputs({ purchase: { ...RESALE, resaleRemaining: -1, resaleYears: 16 } }),
    ).map((p) => p.field);
    expect(fields).toEqual(["purchase.resaleRemaining", "purchase.resaleYears"]);
    expect(
      purchaseProblems(withInputs({ purchase: { ...RESALE, kind: "developer-plan", resaleYears: 0 } })),
    ).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/lib/capacity/purchase.test.ts`
Expected: FAIL — `Cannot find module './purchase'` (or the type errors it implies).

- [ ] **Step 4: Implement `purchase.ts`**

Create `src/lib/capacity/purchase.ts`:

```ts
import { MAX_PLAN_YEARS, MIN_PLAN_YEARS, buildInstallmentShares } from "./schedule";
import type { CalculatorInputs, InputProblem, LoanInput, PurchaseInput } from "./types";

/**
 * How the property is bought, as the engine sees it: an up-front payment at
 * month 0, then an optional stream of developer installments. The three
 * kinds differ only in how `price` maps onto those two:
 *
 *   developer-plan — down payment × price now, the plan's shares × price after;
 *   developer-cash — price × (1 − discount) now, nothing after. `price` stays
 *                    the INSTALLMENT price so its maximum compares with the plan's;
 *   resale         — price (the cash to the seller) now, then the seller's
 *                    fixed remaining balance, split equally over its years.
 */

/** Inputs without a `purchase` are the original calculator: developer installments. */
export const DEFAULT_PURCHASE: PurchaseInput = {
  kind: "developer-plan",
  cashDiscount: 0,
  resaleRemaining: 0,
  resaleYears: 1,
  resaleFrequency: "yearly",
};

export function purchaseOf(inputs: CalculatorInputs): PurchaseInput {
  return inputs.purchase ?? DEFAULT_PURCHASE;
}

/** The loan, when there is one switched on. */
export function activeLoan(inputs: CalculatorInputs): LoanInput | null {
  return inputs.loan?.enabled ? inputs.loan : null;
}

/**
 * Years of the developer stream. A cash purchase still reports the plan's
 * years: that plan is its no-loan alternative, and both sides of a
 * comparison must end on the same month.
 */
export function developerYears(inputs: CalculatorInputs): number {
  const p = purchaseOf(inputs);
  return p.kind === "resale" ? p.resaleYears : inputs.schedule.planYears;
}

/** How long to simulate: until both the developer and the bank are paid. */
export function horizonYears(inputs: CalculatorInputs): number {
  const loan = activeLoan(inputs);
  return Math.max(developerYears(inputs), loan ? loan.years : 0);
}

export interface Deal {
  /** Paid at month 0, by the fund and the loan together. */
  upFront: number;
  /** Developer installment due each month, index 1 … 12·horizon (index 0 unused). */
  developerDue: number[];
  /** What the extra costs (maintenance, finishing) are a share of. */
  costBase: number;
}

/** The payments one price means for this purchase. Assumes `purchaseProblems` is empty. */
export function buildDeal(inputs: CalculatorInputs, price: number, horizon: number): Deal {
  const months = horizon * 12;
  const developerDue = new Array<number>(months + 1).fill(0);
  const spread = (shares: number[], scale: number) => {
    for (let m = 1; m < shares.length && m <= months; m++) developerDue[m] += shares[m] * scale;
  };
  const p = purchaseOf(inputs);
  switch (p.kind) {
    case "developer-cash": {
      const cash = price * (1 - p.cashDiscount);
      return { upFront: cash, developerDue, costBase: cash };
    }
    case "resale":
      spread(
        buildInstallmentShares({ downPayment: 0, planYears: p.resaleYears, mode: "equal", frequency: p.resaleFrequency }),
        p.resaleRemaining,
      );
      return { upFront: price, developerDue, costBase: price + p.resaleRemaining };
    default:
      spread(buildInstallmentShares(inputs.schedule), price);
      return { upFront: price * inputs.schedule.downPayment, developerDue, costBase: price };
  }
}

/** Problems with the purchase's own inputs, each naming its field; empty when fine. */
export function purchaseProblems(inputs: CalculatorInputs): InputProblem[] {
  const p = purchaseOf(inputs);
  const problems: InputProblem[] = [];
  if (p.kind === "developer-cash" && (!Number.isFinite(p.cashDiscount) || p.cashDiscount < 0 || p.cashDiscount >= 1)) {
    problems.push({ field: "purchase.cashDiscount", message: "Cash discount must be at least 0% and less than 100%." });
  }
  if (p.kind === "resale") {
    if (!Number.isFinite(p.resaleRemaining) || p.resaleRemaining < 0) {
      problems.push({
        field: "purchase.resaleRemaining",
        message: "What's still owed to the developer cannot be negative — enter 0 if the seller has paid it all.",
      });
    }
    if (!Number.isInteger(p.resaleYears) || p.resaleYears < MIN_PLAN_YEARS || p.resaleYears > MAX_PLAN_YEARS) {
      problems.push({
        field: "purchase.resaleYears",
        message: `Years left must be a whole number from ${MIN_PLAN_YEARS} to ${MAX_PLAN_YEARS}.`,
      });
    }
  }
  return problems;
}
```

Note: the `default` branch is developer-plan, so an unknown kind from a stale caller behaves like the original calculator rather than returning `undefined`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/capacity/purchase.test.ts`
Expected: PASS. Then `npm test`: every suite still passes (Vitest does not type-check; `tsc` will complain about the new required `SimulationResult` fields until Task 3 fills them — expected, do not patch around it).

- [ ] **Step 6: Commit**

```bash
git add src/lib/capacity/types.ts src/lib/capacity/purchase.ts src/lib/capacity/purchase.test.ts
git commit -m "Capacity: purchase kinds — developer plan, cash, resale

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```

---

### Task 2: Flat-rate loan maths

**Files:**
- Create: `src/lib/capacity/loan.ts`
- Test: `src/lib/capacity/loan.test.ts`

**Interfaces:**
- Consumes: `LoanInput`, `PledgeRelease`, `InputProblem` (Task 1); `MIN_PLAN_YEARS`, `MAX_PLAN_YEARS`.
- Produces:
  - `interface LoanTerms { amount: number; pledge: number; months: number; monthlyInstallment: number; totalInterest: number; equivalentDecliningRate: number }`
  - `loanTerms(loan: LoanInput, upFront: number): LoanTerms`
  - `pledgeHeld(terms: LoanTerms, release: PledgeRelease, paid: number): number` — pledge still locked after `paid` installments
  - `decliningRateFromFlat(flatRate: number, years: number): number`
  - `loanProblems(loan: LoanInput | undefined): InputProblem[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/capacity/loan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decliningRateFromFlat, loanProblems, loanTerms, pledgeHeld } from "./loan";
import type { LoanInput } from "./types";

const LOAN: LoanInput = {
  enabled: true,
  share: 0.9,
  flatRate: 0.12,
  years: 5,
  lendingRatio: 1,
  certificateRate: 0.11,
  release: "at-end",
};

describe("loanTerms — flat rate", () => {
  it("borrows a share of the up-front payment and charges flat interest on all of it every year", () => {
    const t = loanTerms(LOAN, 10_000_000);
    expect(t.amount).toBe(9_000_000);
    expect(t.months).toBe(60);
    expect(t.totalInterest).toBeCloseTo(5_400_000, 6);
    expect(t.monthlyInstallment).toBeCloseTo(240_000, 6);
  });
  it("pledges the loan divided by the lending ratio", () => {
    expect(loanTerms(LOAN, 10_000_000).pledge).toBe(9_000_000);
    expect(loanTerms({ ...LOAN, lendingRatio: 0.9 }, 10_000_000).pledge).toBeCloseTo(10_000_000, 6);
  });
});

describe("decliningRateFromFlat", () => {
  it("is 0 for a 0% loan", () => {
    expect(decliningRateFromFlat(0, 5)).toBe(0);
  });
  it("finds the nominal rate whose annuity has the same installment (12% flat, 5 years ≈ 20.3%)", () => {
    const r = decliningRateFromFlat(0.12, 5);
    expect(r).toBeCloseTo(0.2031, 3);
    const i = r / 12;
    const annuity = i / (1 - Math.pow(1 + i, -60));
    expect(annuity).toBeCloseTo((1 + 0.12 * 5) / 60, 8);
  });
  it("is carried on the terms", () => {
    expect(loanTerms(LOAN, 1).equivalentDecliningRate).toBeCloseTo(decliningRateFromFlat(0.12, 5), 10);
  });
});

describe("pledgeHeld", () => {
  const t = loanTerms(LOAN, 10_000_000);
  it("at-end: the whole pledge until the last installment, then nothing", () => {
    expect(pledgeHeld(t, "at-end", 0)).toBe(9_000_000);
    expect(pledgeHeld(t, "at-end", 59)).toBe(9_000_000);
    expect(pledgeHeld(t, "at-end", 60)).toBe(0);
    expect(pledgeHeld(t, "at-end", 70)).toBe(0);
  });
  it("gradual: remaining principal ÷ ratio — flat loans repay principal in equal parts", () => {
    expect(pledgeHeld(t, "gradual", 30)).toBeCloseTo(4_500_000, 6);
    expect(pledgeHeld(t, "gradual", 60)).toBe(0);
    const t2 = loanTerms({ ...LOAN, lendingRatio: 0.5 }, 10_000_000);
    expect(pledgeHeld(t2, "gradual", 15)).toBeCloseTo(18_000_000 * 0.75, 6);
  });
});

describe("loanProblems", () => {
  it("has nothing to say about an absent or switched-off loan", () => {
    expect(loanProblems(undefined)).toEqual([]);
    expect(loanProblems({ ...LOAN, enabled: false, years: 0 })).toEqual([]);
  });
  it("names each bad field", () => {
    const fields = loanProblems({
      ...LOAN,
      share: 1.5,
      flatRate: -0.01,
      years: 2.5,
      lendingRatio: 0,
      certificateRate: 2,
    }).map((p) => p.field);
    expect(fields).toEqual(["loan.share", "loan.flatRate", "loan.years", "loan.lendingRatio", "loan.certificateRate"]);
  });
  it("says what most banks lend when the lending ratio is out of range", () => {
    const [p] = loanProblems({ ...LOAN, lendingRatio: 1.2 });
    expect(p.message).toMatch(/90–100%/);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/lib/capacity/loan.test.ts`
Expected: FAIL — `Cannot find module './loan'`.

- [ ] **Step 3: Implement `loan.ts`**

Create `src/lib/capacity/loan.ts`:

```ts
import { MAX_PLAN_YEARS, MIN_PLAN_YEARS } from "./schedule";
import type { InputProblem, LoanInput, PledgeRelease } from "./types";

/**
 * A bank loan secured by certificates, priced at a FLAT rate.
 *
 * Flat means the interest is charged on the ORIGINAL amount for every year
 * of the loan — `amount × flatRate × years` in total — and the whole of it,
 * principal plus interest, is repaid in equal monthly installments. The
 * principal inside each installment is `amount / months`, so after k
 * installments `amount × (1 − k/months)` is still owed: that is what a
 * gradual release tracks.
 */

export interface LoanTerms {
  amount: number;
  pledge: number;
  months: number;
  monthlyInstallment: number;
  totalInterest: number;
  /** Nominal annual rate (monthly × 12) of the declining-balance loan with the same installment. */
  equivalentDecliningRate: number;
}

export function loanTerms(loan: LoanInput, upFront: number): LoanTerms {
  const amount = upFront * loan.share;
  const months = loan.years * 12;
  const totalInterest = amount * loan.flatRate * loan.years;
  return {
    amount,
    pledge: amount / loan.lendingRatio,
    months,
    monthlyInstallment: (amount + totalInterest) / months,
    totalInterest,
    equivalentDecliningRate: decliningRateFromFlat(loan.flatRate, loan.years),
  };
}

/** The pledge still locked after `paid` monthly installments. */
export function pledgeHeld(terms: LoanTerms, release: PledgeRelease, paid: number): number {
  if (paid >= terms.months) return 0;
  return release === "at-end" ? terms.pledge : terms.pledge * (1 - paid / terms.months);
}

/**
 * The declining-balance rate a bank would quote for the same monthly
 * installment: solve `i / (1 − (1+i)^−n) = (1 + flat·years) / n` for the
 * monthly rate i by bisection (the annuity factor rises with i), then ×12.
 */
export function decliningRateFromFlat(flatRate: number, years: number): number {
  if (flatRate <= 0) return 0;
  const n = years * 12;
  const payment = (1 + flatRate * years) / n;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 100; k++) {
    const i = (lo + hi) / 2;
    if (i / (1 - Math.pow(1 + i, -n)) > payment) hi = i;
    else lo = i;
  }
  return ((lo + hi) / 2) * 12;
}

/** Problems with a switched-on loan, each naming its field. Messages say what to do. */
export function loanProblems(loan: LoanInput | undefined): InputProblem[] {
  if (!loan?.enabled) return [];
  const problems: InputProblem[] = [];
  const fraction = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
  if (!fraction(loan.share)) {
    problems.push({ field: "loan.share", message: "Borrow between 0% and 100% of what you pay up front." });
  }
  if (!fraction(loan.flatRate)) {
    problems.push({ field: "loan.flatRate", message: "Flat rate must be between 0% and 100% a year." });
  }
  if (!Number.isInteger(loan.years) || loan.years < MIN_PLAN_YEARS || loan.years > MAX_PLAN_YEARS) {
    problems.push({
      field: "loan.years",
      message: `Loan length must be a whole number of years from ${MIN_PLAN_YEARS} to ${MAX_PLAN_YEARS}.`,
    });
  }
  if (!Number.isFinite(loan.lendingRatio) || loan.lendingRatio <= 0 || loan.lendingRatio > 1) {
    problems.push({
      field: "loan.lendingRatio",
      message: "The bank must lend more than 0% and at most 100% of the certificates — most banks lend 90–100%.",
    });
  }
  if (!fraction(loan.certificateRate)) {
    problems.push({ field: "loan.certificateRate", message: "Certificate rate must be between 0% and 100% a year." });
  }
  return problems;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/capacity/loan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/capacity/loan.ts src/lib/capacity/loan.test.ts
git commit -m "Capacity: flat-rate loan terms, pledge release, declining-rate equivalent

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```

---

### Task 3: The month walk with a pledge and a loan

**Files:**
- Modify: `src/lib/capacity/simulate.ts`
- Modify: `src/lib/capacity/simulate.test.ts` (one existing assertion, plus new tests)

**Interfaces:**
- Consumes: Task 1 (`buildDeal`, `horizonYears`, `activeLoan`, `purchaseOf`, `purchaseProblems`), Task 2 (`loanTerms`, `pledgeHeld`, `loanProblems`).
- Produces:
  - `simulate(inputs: CalculatorInputs, price: number, horizon?: number): SimulationResult` — `horizon` defaults to `horizonYears(inputs)`
  - `isFeasible(inputs: CalculatorInputs, price: number, horizon?: number): boolean`
  - `inputProblems` now includes purchase and loan problems; skips `scheduleProblems` for a resale; extra-cost years are valid up to `horizonYears(inputs)`.

- [ ] **Step 1: Update the one existing assertion that pins the old `MonthPoint` shape**

In `src/lib/capacity/simulate.test.ts`, test "starts with capital minus the down payment, with no flows of its own", replace the `toEqual` line with:

```ts
    expect(r.monthly[0]).toEqual({
      month: 0,
      balance: 4_200_000,
      returns: 0,
      income: 0,
      installment: 0,
      extraCost: 0,
      certificateInterest: 0,
      bankInstallment: 0,
      released: 0,
      held: 0,
    });
```

And in "carries each month's flows on its point…", replace the per-month equation with the full one:

```ts
      expect(p.balance).toBeCloseTo(
        prev + p.returns + p.certificateInterest + p.income - p.installment - p.extraCost - p.bankInstallment + p.released,
        6,
      );
```

- [ ] **Step 2: Write the new failing tests**

Append to `src/lib/capacity/simulate.test.ts` (add `import { maxFeasiblePrice } from "./solve";` and `import type { LoanInput, PurchaseInput } from "./types";` to the imports — merge the type import with the existing one):

```ts
const LOAN: LoanInput = {
  enabled: true,
  share: 0.9,
  flatRate: 0.12,
  years: 5,
  lendingRatio: 1,
  certificateRate: 0.11,
  release: "at-end",
};
const RESALE: PurchaseInput = {
  kind: "resale",
  cashDiscount: 0,
  resaleRemaining: 5_000_000,
  resaleYears: 4,
  resaleFrequency: "yearly",
};
/** Savings large enough to carry the resale example: 10M to the seller, 9M of it borrowed. */
const RESALE_DEAL = withInputs({
  startingCapital: 20_000_000,
  purchase: RESALE,
  loan: LOAN,
  maintenance: { share: 0, year: 1 },
});

describe("simulate — the reference survives the generalisation", () => {
  it("still solves to 8,860,000 and ends at 500,991 with no purchase and no loan given", () => {
    const { maxPrice, simulation } = maxFeasiblePrice(REFERENCE);
    expect(maxPrice).toBe(8_860_000);
    expect(Math.round(simulation!.finalBalance)).toBe(500_991);
    expect(simulation!.loan).toBeNull();
    expect(simulation!.upFront).toBe(simulation!.downPayment);
    expect(simulation!.upFrontFromFund).toBe(simulation!.downPayment);
  });
});

describe("simulate — with a loan against certificates", () => {
  it("month 0: the fund pays its share of the up-front payment and locks the pledge", () => {
    const r = simulate(RESALE_DEAL, 10_000_000);
    expect(r.upFront).toBe(10_000_000);
    expect(r.upFrontFromFund).toBeCloseTo(1_000_000, 6);
    expect(r.monthly[0].held).toBe(9_000_000);
    expect(r.monthly[0].balance).toBeCloseTo(20_000_000 - 1_000_000 - 9_000_000, 6);
  });

  it("pays rate/12 on the pledge every month and the bank installment for the loan's months", () => {
    const r = simulate(RESALE_DEAL, 10_000_000);
    expect(r.monthly[1].certificateInterest).toBeCloseTo(82_500, 6);
    expect(r.monthly[1].bankInstallment).toBeCloseTo(240_000, 6);
    expect(r.monthly[60].bankInstallment).toBeCloseTo(240_000, 6);
    expect(r.loan!.totalInterest).toBeCloseTo(5_400_000, 6);
    expect(r.loan!.certificateInterest).toBeCloseTo(82_500 * 60, 4);
    expect(r.loan!.netCost).toBeCloseTo(5_400_000 - 4_950_000, 4);
  });

  it("at-end release: the whole pledge comes back on the last installment", () => {
    const r = simulate(RESALE_DEAL, 10_000_000);
    expect(r.monthly[59].held).toBe(9_000_000);
    expect(r.monthly[60].released).toBe(9_000_000);
    expect(r.monthly[60].held).toBe(0);
  });

  it("gradual release: the pledge follows the remaining principal down", () => {
    const r = simulate(withInputs({ ...RESALE_DEAL, loan: { ...LOAN, release: "gradual" } }), 10_000_000);
    expect(r.monthly[30].held).toBeCloseTo(4_500_000, 6);
    expect(r.monthly[1].released).toBeCloseTo(150_000, 6);
    expect(r.monthly[60].held).toBe(0);
  });

  it("runs to the longer of the developer stream and the loan", () => {
    const r = simulate(RESALE_DEAL, 10_000_000);
    expect(r.horizonYears).toBe(5);
    expect(r.monthly).toHaveLength(61);
    expect(r.monthly[60].installment).toBe(0); // the resale's 4 years are over
    expect(r.monthly[48].installment).toBeCloseTo(1_250_000, 6);
  });

  it("checks the buffer against the spendable fund only", () => {
    // 20M savings, 9M locked, 1M paid: 10M spendable at month 0. A 12M buffer
    // is under spendable + held (19M) but over spendable alone.
    const r = simulate(withInputs({ ...RESALE_DEAL, safetyBuffer: 12_000_000 }), 10_000_000);
    expect(r.feasible).toBe(false);
    expect(r.firstBreach!.month).toBe(0);
  });

  it("is infeasible at month 0 when the pledge plus the fund's share exceeds the savings", () => {
    const r = simulate(
      withInputs({ ...RESALE_DEAL, startingCapital: 8_000_000, safetyBuffer: 0, loan: { ...LOAN, share: 1, lendingRatio: 0.9 } }),
      10_000_000,
    );
    expect(r.feasible).toBe(false);
    expect(r.firstBreach!.month).toBe(0);
  });

  it("a free loan is a 0% installment plan: spendable + held follows the plan's balance", () => {
    const rate = monthlyRate(0.12) * 12;
    const base = withInputs({
      startingCapital: 20_000_000,
      maintenance: { share: 0, year: 1 },
      income: { amount: 0, frequency: "yearly", annualIncrease: 0 },
      safetyBuffer: 0,
      schedule: { downPayment: 0, planYears: 5, mode: "equal", frequency: "monthly" },
    });
    const withLoan = simulate(
      {
        ...base,
        purchase: { ...RESALE, kind: "developer-cash", cashDiscount: 0 },
        loan: { ...LOAN, share: 1, flatRate: 0, certificateRate: rate },
      },
      10_000_000,
    );
    const plan = simulate(base, 10_000_000);
    for (let m = 0; m <= 60; m++) {
      const p = withLoan.monthly[m];
      expect(p.balance + p.held).toBeCloseTo(plan.monthly[m].balance, 2);
    }
  });

  it("reconciles every year row with a loan on", () => {
    for (const release of ["at-end", "gradual"] as const) {
      const r = simulate(withInputs({ ...RESALE_DEAL, loan: { ...LOAN, release } }), 10_000_000);
      for (const y of r.years) {
        expect(y.closing).toBeCloseTo(
          y.opening + y.returns + y.certificateInterest + y.income + y.released
            - y.downPayment - y.pledged - y.installments - y.bankInstallments - y.extraCosts,
          4,
        );
      }
      expect(r.years[0].pledged).toBe(9_000_000);
      expect(r.years[1].pledged).toBe(0);
    }
  });

  it("puts extra costs on the cash price for a developer cash purchase, and on cash + remaining for a resale", () => {
    const cash = simulate(
      withInputs({
        startingCapital: 20_000_000,
        purchase: { ...RESALE, kind: "developer-cash", cashDiscount: 0.3 },
        maintenance: { share: 0.1, year: 1 },
      }),
      10_000_000,
    );
    expect(cash.monthly[12].extraCost).toBeCloseTo(700_000, 6);
    const resale = simulate(withInputs({ ...RESALE_DEAL, maintenance: { share: 0.1, year: 1 } }), 10_000_000);
    expect(resale.monthly[12].extraCost).toBeCloseTo(1_500_000, 6);
  });
});

describe("inputProblems — purchase and loan", () => {
  it("passes a sound resale with a loan", () => {
    expect(inputProblems(RESALE_DEAL)).toEqual([]);
  });
  it("ignores the hidden developer plan for a resale", () => {
    const fields = inputProblems(
      withInputs({ ...RESALE_DEAL, schedule: { downPayment: 0.1, planYears: 99, mode: "equal", frequency: "yearly" } }),
    ).map((p) => p.field);
    expect(fields).toEqual([]);
  });
  it("allows an extra cost in any year up to the horizon", () => {
    const inputs = withInputs({ loan: { ...LOAN, years: 10 }, maintenance: { share: 0.08, year: 10 } });
    expect(inputProblems(inputs)).toEqual([]);
    const late = withInputs({ loan: { ...LOAN, years: 10 }, maintenance: { share: 0.08, year: 11 } });
    expect(inputProblems(late).map((p) => p.field)).toEqual(["maintenance.year"]);
  });
  it("reports loan and purchase problems with their fields", () => {
    const fields = inputProblems(
      withInputs({ ...RESALE_DEAL, purchase: { ...RESALE, resaleYears: 0 }, loan: { ...LOAN, lendingRatio: 0 } }),
    ).map((p) => p.field);
    expect(fields).toContain("purchase.resaleYears");
    expect(fields).toContain("loan.lendingRatio");
  });
});
```

Add to `src/lib/capacity/solve.test.ts` (imports: `simulate`, `maxFeasiblePrice` already present; add `import type { LoanInput, PurchaseInput } from "./types";`):

```ts
describe("maxFeasiblePrice — monotonic for every kind, loan on and off", () => {
  const LOAN: LoanInput = {
    enabled: true, share: 0.9, flatRate: 0.12, years: 5, lendingRatio: 1, certificateRate: 0.11, release: "gradual",
  };
  const purchases: PurchaseInput[] = [
    { kind: "developer-plan", cashDiscount: 0, resaleRemaining: 0, resaleYears: 1, resaleFrequency: "yearly" },
    { kind: "developer-cash", cashDiscount: 0.25, resaleRemaining: 0, resaleYears: 1, resaleFrequency: "yearly" },
    { kind: "resale", cashDiscount: 0, resaleRemaining: 2_000_000, resaleYears: 4, resaleFrequency: "quarterly" },
  ];
  for (const purchase of purchases) {
    for (const loan of [undefined, LOAN]) {
      it(`${purchase.kind}, ${loan ? "with" : "without"} a loan`, () => {
        const inputs = withInputs({
          purchase,
          loan,
          income: { amount: 40_000, frequency: "monthly", annualIncrease: 0.05 },
        });
        const { maxPrice } = maxFeasiblePrice(inputs);
        expect(maxPrice).not.toBeNull();
        for (const k of [1, 10, 100, 1_000]) {
          const below = maxPrice! - k * 1_000;
          if (below >= 0) expect(simulate(inputs, below).feasible, `${below} feasible`).toBe(true);
          expect(simulate(inputs, maxPrice! + k * 1_000).feasible, `${maxPrice! + k * 1_000} infeasible`).toBe(false);
        }
      });
    }
  }
});
```

(If `withInputs` is not already defined in `solve.test.ts`, add `const withInputs = (over: Partial<CalculatorInputs>): CalculatorInputs => ({ ...REFERENCE, ...over });` with the matching imports.)

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run src/lib/capacity`
Expected: FAIL — new fields `undefined`, horizon length 97 instead of 61, etc.

- [ ] **Step 4: Rewrite `simulate.ts`**

Replace the header comment's month list in `src/lib/capacity/simulate.ts` with:

```ts
/**
 * The month-by-month engine.
 *
 * Month 0: the fund pays its share of the up-front payment (the rest is the
 * loan) and the pledge moves from the spendable fund into `held`.
 * Each month 1 … 12·horizon, in this order:
 *   1. growth — spendable × monthly rate × (1 − fee), on a POSITIVE balance
 *               only; certificate interest — held × certificateRate / 12;
 *   2. income — monthly every month, yearly at months 12, 24, …; both grow by
 *               the annual increase once per year;
 *   3. payments — the developer installment due this month, any extra cost
 *               due at the end of this year, and the bank installment while
 *               the loan runs;
 *   4. release — the pledge the bank no longer needs returns to spendable.
 *
 * A price is feasible when the fund's share plus the pledge fits inside the
 * capital, the SPENDABLE balance never drops below the buffer (month 0
 * included) — pledged money cannot cover an emergency — AND the plan ends
 * with at least `minKeptShare` of the starting capital. The horizon covers
 * the loan, so the pledge is always back by the end.
 */
```

Update the imports:

```ts
import { loanProblems, loanTerms, pledgeHeld } from "./loan";
import { activeLoan, buildDeal, horizonYears, purchaseOf, purchaseProblems } from "./purchase";
import { monthlyRate } from "./rates";
import { scheduleProblems } from "./schedule";
import type { CalculatorInputs, InputProblem, MonthPoint, SimulationResult, YearSummary } from "./types";
```

In `inputProblems`: replace `problems.push(...scheduleProblems(schedule));` with

```ts
  // A resale has no developer plan of its own; the hidden plan fields must
  // not block it.
  if (purchaseOf(inputs).kind !== "resale") problems.push(...scheduleProblems(schedule));
  problems.push(...purchaseProblems(inputs));
  problems.push(...loanProblems(inputs.loan));
  const horizon = horizonYears(inputs);
```

and in the extra-cost loop replace `schedule.planYears` (both the comparison and the message) with `horizon`.

Replace `extraCostShares` with:

```ts
/** Extra costs (as a fraction of the deal's cost base) due at the end of each year, index 1 … horizon. */
function extraCostShares(inputs: CalculatorInputs, horizon: number): number[] {
  const shares = new Array<number>(horizon + 1).fill(0);
  for (const cost of [inputs.maintenance, inputs.finishing]) {
    if (cost.share > 0 && cost.year >= 1 && cost.year <= horizon) shares[cost.year] += cost.share;
  }
  return shares;
}
```

Replace `simulate` with:

```ts
/** Simulate one price through the whole deal. Assumes `validateInputs` is empty. */
export function simulate(inputs: CalculatorInputs, price: number, horizon = horizonYears(inputs)): SimulationResult {
  const { startingCapital, income, safetyBuffer, returnFee, minKeptShare } = inputs;
  const rate = monthlyRate(inputs.effectiveAnnualRate) * (1 - returnFee);
  const deal = buildDeal(inputs, price, horizon);
  const costShares = extraCostShares(inputs, horizon);
  const loan = activeLoan(inputs);
  const terms = loan ? loanTerms(loan, deal.upFront) : null;
  const certificateRate = loan ? loan.certificateRate / 12 : 0;

  const upFrontFromFund = deal.upFront - (terms?.amount ?? 0);
  let held = terms?.pledge ?? 0;
  let balance = startingCapital - upFrontFromFund - held;

  const monthly: MonthPoint[] = [
    {
      month: 0,
      balance,
      returns: 0,
      income: 0,
      installment: 0,
      extraCost: 0,
      certificateInterest: 0,
      bankInstallment: 0,
      released: 0,
      held,
    },
  ];
  const years: YearSummary[] = [];
  let minBalance = balance;
  let firstBreach: SimulationResult["firstBreach"] = null;
  let totalExtraCosts = 0;
  let totalInstallments = 0;
  let totalCertificateInterest = 0;

  const breaches = (b: number) => b < safetyBuffer - EPSILON;
  if (upFrontFromFund + (terms?.pledge ?? 0) > startingCapital + EPSILON || breaches(balance)) {
    firstBreach = { month: 0, shortfall: safetyBuffer - balance };
  }

  for (let year = 1; year <= horizon; year++) {
    // The up-front payment and the pledge are year 1's: that row opens on the
    // capital itself and its lowest balance includes the moment right after.
    const opening = year === 1 ? startingCapital : balance;
    let returns = 0;
    let incomeAdded = 0;
    let installments = 0;
    let extraCosts = 0;
    let certificateInterest = 0;
    let bankInstallments = 0;
    let released = 0;
    let lowest = year === 1 ? balance : Number.POSITIVE_INFINITY;

    const incomeThisYear = income.amount * Math.pow(1 + income.annualIncrease, year - 1);

    for (let m = 1; m <= 12; m++) {
      const month = (year - 1) * 12 + m;

      // 1. growth on spendable money; the pledge earns the certificate rate
      const growth = balance > 0 ? balance * rate : 0;
      const certificate = held * certificateRate;
      balance += growth + certificate;
      returns += growth;
      certificateInterest += certificate;

      // 2. income
      const due = income.frequency === "monthly" ? incomeThisYear : m === 12 ? incomeThisYear : 0;
      balance += due;
      incomeAdded += due;

      // 3. payments
      const installment = deal.developerDue[month];
      const cost = m === 12 ? deal.costBase * costShares[year] : 0;
      const bank = terms && month <= terms.months ? terms.monthlyInstallment : 0;
      balance -= installment + cost + bank;
      installments += installment;
      extraCosts += cost;
      bankInstallments += bank;

      // 4. release
      const nextHeld = terms && loan ? pledgeHeld(terms, loan.release, month) : 0;
      const freed = held - nextHeld;
      held = nextHeld;
      balance += freed;
      released += freed;

      monthly.push({
        month,
        balance,
        returns: growth,
        income: due,
        installment,
        extraCost: cost,
        certificateInterest: certificate,
        bankInstallment: bank,
        released: freed,
        held,
      });
      if (balance < lowest) lowest = balance;
      if (balance < minBalance) minBalance = balance;
      if (firstBreach === null && breaches(balance)) {
        firstBreach = { month, shortfall: safetyBuffer - balance };
      }
    }

    totalExtraCosts += extraCosts;
    totalInstallments += installments;
    totalCertificateInterest += certificateInterest;
    years.push({
      year,
      opening,
      downPayment: year === 1 ? upFrontFromFund : 0,
      returns,
      income: incomeAdded,
      installments,
      extraCosts,
      pledged: year === 1 ? (terms?.pledge ?? 0) : 0,
      released,
      certificateInterest,
      bankInstallments,
      closing: balance,
      lowest,
      breached: breaches(lowest),
    });
  }

  const keepTarget = minKeptShare * startingCapital;
  const endShortfall =
    minKeptShare > 0 && balance < keepTarget - EPSILON ? { target: keepTarget, shortfall: keepTarget - balance } : null;

  return {
    price,
    feasible: firstBreach === null && endShortfall === null,
    downPayment: deal.upFront,
    upFront: deal.upFront,
    upFrontFromFund,
    totalInstallments,
    totalExtraCosts,
    totalCertificateInterest,
    finalBalance: balance,
    minBalance,
    firstBreach,
    endShortfall,
    paidIntoProperty: deal.upFront + totalInstallments + totalExtraCosts,
    keptInFund: balance,
    keptShareOfCapital: startingCapital > 0 ? balance / startingCapital : 0,
    loan: terms
      ? {
          ...terms,
          certificateInterest: totalCertificateInterest,
          netCost: terms.totalInterest - totalCertificateInterest,
        }
      : null,
    horizonYears: horizon,
    monthly,
    years,
  };
}
```

Replace `isFeasible` with:

```ts
export function isFeasible(inputs: CalculatorInputs, price: number, horizon?: number): boolean {
  return simulate(inputs, price, horizon).feasible;
}
```

(Keep its existing doc comment.)

- [ ] **Step 5: Thread the horizon through `maxFeasiblePrice`**

In `src/lib/capacity/solve.ts`, change the signature and every `isFeasible`/`simulate` call inside it:

```ts
export function maxFeasiblePrice(
  inputs: CalculatorInputs,
  step = DEFAULT_STEP,
  horizon = horizonYears(inputs),
): CapacityResult {
```

— `isFeasible(inputs, X)` → `isFeasible(inputs, X, horizon)` (four calls) and the final `simulate(inputs, maxPrice)` → `simulate(inputs, maxPrice, horizon)`. Add `import { horizonYears } from "./purchase";`.

- [ ] **Step 6: Run the whole capacity suite**

Run: `npx vitest run src/lib/capacity`
Expected: PASS, including the 8,860,000 reference and every pre-existing test. If `totalInstallments` in an old test differs in the last float digit, the old test already uses `toBeCloseTo` — do not loosen any other assertion.

- [ ] **Step 7: Commit**

```bash
git add src/lib/capacity
git commit -m "Capacity: simulate the pledge, certificate interest and bank installments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```

---

### Task 4: Compare with and without the loan

**Files:**
- Modify: `src/lib/capacity/solve.ts`, `src/lib/capacity/index.ts`
- Test: `src/lib/capacity/solve.test.ts`

**Interfaces:**
- Consumes: `maxFeasiblePrice(inputs, step, horizon)`, `simulate(inputs, price, horizon)`, `horizonYears`, `purchaseOf`, `Comparison`.
- Produces:
  - `withoutLoan(inputs: CalculatorInputs): CalculatorInputs`
  - `compare(inputs: CalculatorInputs, testPrice?: number | null, step?: number): Comparison`
  - `index.ts` exports everything new from `purchase.ts`, `loan.ts`, and `withoutLoan`, `compare`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/capacity/solve.test.ts` (add `compare, withoutLoan` to the `./solve` import):

```ts
describe("withoutLoan / compare", () => {
  const LOAN: LoanInput = {
    enabled: true, share: 1, flatRate: 0.1, years: 10, lendingRatio: 1, certificateRate: 0.15, release: "at-end",
  };
  const CASH: PurchaseInput = {
    kind: "developer-cash", cashDiscount: 0.3, resaleRemaining: 0, resaleYears: 1, resaleFrequency: "yearly",
  };

  it("turns the loan off, and a cash purchase back into the developer's plan", () => {
    const base = withoutLoan(withInputs({ purchase: CASH, loan: LOAN }));
    expect(base.loan?.enabled ?? false).toBe(false);
    expect(base.purchase!.kind).toBe("developer-plan");
    const resale = withoutLoan(withInputs({ purchase: { ...CASH, kind: "resale", resaleYears: 3 }, loan: LOAN }));
    expect(resale.purchase!.kind).toBe("resale");
  });

  it("measures both sides over the deal's horizon, so the endings share a date", () => {
    const c = compare(withInputs({ purchase: CASH, loan: LOAN }), 5_000_000);
    expect(c.horizonYears).toBe(10);
    expect(c.tested!.withLoan.monthly).toHaveLength(121);
    expect(c.tested!.withoutLoan.monthly).toHaveLength(121);
    expect(c.withoutLoan.simulation!.horizonYears).toBe(10);
  });

  it("solves both maxima; the with-loan side equals solving the deal on its own", () => {
    const inputs = withInputs({ purchase: CASH, loan: LOAN });
    const c = compare(inputs);
    expect(c.withLoan.maxPrice).toBe(maxFeasiblePrice(inputs).maxPrice);
    expect(c.withoutLoan.maxPrice).toBe(maxFeasiblePrice(withoutLoan(inputs), undefined, 10).maxPrice);
    expect(c.tested).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/lib/capacity/solve.test.ts`
Expected: FAIL — `compare is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/capacity/solve.ts` (update imports: `import { horizonYears, purchaseOf } from "./purchase";` and add `Comparison` to the type import):

```ts
/**
 * The same purchase paid without the bank: the loan switched off, and a
 * developer cash purchase — which only makes sense with money in hand —
 * replaced by the developer's installment plan it would otherwise be.
 */
export function withoutLoan(inputs: CalculatorInputs): CalculatorInputs {
  const purchase = purchaseOf(inputs);
  return {
    ...inputs,
    loan: inputs.loan ? { ...inputs.loan, enabled: false } : undefined,
    purchase: purchase.kind === "developer-cash" ? { ...purchase, kind: "developer-plan" } : purchase,
  };
}

/**
 * "Is the loan worth it?" — both maxima, and both simulations at a price
 * being checked, over ONE horizon (the deal's, which is never shorter than
 * the alternative's) so the two final balances are measured on the same date.
 */
export function compare(inputs: CalculatorInputs, testPrice: number | null = null, step = DEFAULT_STEP): Comparison {
  const horizon = horizonYears(inputs);
  const base = withoutLoan(inputs);
  return {
    horizonYears: horizon,
    withLoan: maxFeasiblePrice(inputs, step, horizon),
    withoutLoan: maxFeasiblePrice(base, step, horizon),
    tested:
      testPrice === null
        ? null
        : { withLoan: simulate(inputs, testPrice, horizon), withoutLoan: simulate(base, testPrice, horizon) },
  };
}
```

Update `src/lib/capacity/index.ts`:

```ts
export { decliningRateFromFlat, loanProblems, loanTerms, pledgeHeld, type LoanTerms } from "./loan";
export {
  DEFAULT_PURCHASE,
  activeLoan,
  buildDeal,
  developerYears,
  horizonYears,
  purchaseOf,
  purchaseProblems,
  type Deal,
} from "./purchase";
export {
  DEFAULT_SENSITIVITY_DELTAS,
  DEFAULT_STEP,
  compare,
  maxFeasiblePrice,
  sensitivity,
  withoutLoan,
} from "./solve";
```

(replacing the existing `./solve` export line).

- [ ] **Step 4: Run all tests and type-check**

Run: `npx vitest run src/lib/capacity && npx tsc --noEmit -p .`
Expected: tests PASS. `tsc` may report errors in UI files that read `MonthPoint`/`YearSummary` — there should be none, since fields were only added; if there are, they are in Task 5–10 files and are fixed there. Note them, do not fix UI here.

- [ ] **Step 5: Commit**

```bash
git add src/lib/capacity
git commit -m "Capacity: compare a deal with its no-loan alternative over one horizon

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```

---

### Task 5: The form layer

**Files:**
- Modify: `src/app/lib/capacityForm.ts`
- Modify: `src/app/lib/capacityForm.test.ts`

**Interfaces:**
- Consumes: `PurchaseKind`, `PledgeRelease`, `PurchaseInput`, `LoanInput`, `InputField` from `@/lib/capacity`.
- Produces: new `CapacityForm` fields (exact names below), new `FormField` members `"cashDiscountPct" | "resaleRemaining" | "resaleYears" | "loanSharePct" | "loanFlatRatePct" | "loanYears" | "lendingRatioPct" | "certificateRatePct"`; `parseForm` emits `inputs.purchase` always and `inputs.loan` only when enabled; `PLAN_FIELDS: readonly FormField[]`.

- [ ] **Step 1: Fix the existing exact-shape test**

In `capacityForm.test.ts`, the first test's `expect(inputs).toEqual({...})` gains:

```ts
      purchase: { kind: "developer-plan", cashDiscount: 0, resaleRemaining: 0, resaleYears: 1, resaleFrequency: "yearly" },
```

(no `loan` key — it is only emitted when enabled).

- [ ] **Step 2: Write the failing tests**

Append to `capacityForm.test.ts`:

```ts
describe("parseForm — purchase and loan", () => {
  it("parses a resale with a loan", () => {
    const { inputs, errors } = parseForm(
      form({
        purchaseKind: "resale",
        resaleRemaining: "5,000,000",
        resaleYears: "4",
        resaleFrequency: "quarterly",
        loanEnabled: true,
        loanSharePct: "90",
        loanFlatRatePct: "12",
        loanYears: "5",
        lendingRatioPct: "100",
        certificateRatePct: "11",
        pledgeRelease: "gradual",
      }),
    );
    expect(errors).toEqual([]);
    expect(inputs!.purchase).toEqual({
      kind: "resale",
      cashDiscount: 0,
      resaleRemaining: 5_000_000,
      resaleYears: 4,
      resaleFrequency: "quarterly",
    });
    expect(inputs!.loan).toEqual({
      enabled: true,
      share: 0.9,
      flatRate: 0.12,
      years: 5,
      lendingRatio: 1,
      certificateRate: 0.11,
      release: "gradual",
    });
  });

  it("reads a blank cash discount as 0 and a typed one as a fraction", () => {
    expect(parseForm(form({ purchaseKind: "developer-cash" })).inputs!.purchase!.cashDiscount).toBe(0);
    expect(parseForm(form({ purchaseKind: "developer-cash", cashDiscountPct: "30" })).inputs!.purchase!.cashDiscount).toBe(0.3);
  });

  it("does not let the hidden plan fields block a resale", () => {
    const { inputs, errors, byField } = parseForm(
      form({ purchaseKind: "resale", resaleRemaining: "0", resaleYears: "3", planYears: "", downPaymentPct: "abc" }),
    );
    expect(errors).toEqual([]);
    expect(byField.planYears).toBeUndefined();
    expect(inputs).not.toBeNull();
  });

  it("ignores the loan fields while the loan is off", () => {
    const { inputs, errors } = parseForm(form({ loanEnabled: false, loanYears: "", lendingRatioPct: "x" }));
    expect(errors).toEqual([]);
    expect(inputs!.loan).toBeUndefined();
  });

  it("puts loan problems on the loan's fields", () => {
    // A blank field is caught before the engine runs (existing behaviour), so
    // only it is reported; once every field is a number the engine speaks.
    const { errors } = parseForm(form({ loanEnabled: true, loanYears: "" }));
    expect(errors.map((e) => e.field)).toEqual(["loanYears"]);
    const second = parseForm(form({ loanEnabled: true, lendingRatioPct: "0" }));
    expect(second.errors.map((e) => e.field)).toEqual(["lendingRatioPct"]);
  });

  it("lists purchase fields before the capital and loan fields after the plan", () => {
    const { errors } = parseForm(
      form({
        purchaseKind: "resale",
        resaleRemaining: "0",
        resaleYears: "20",
        startingCapital: "-1",
        loanEnabled: true,
        loanSharePct: "150",
      }),
    );
    expect(errors.map((e) => e.field)).toEqual(["resaleYears", "startingCapital", "loanSharePct"]);
  });
});

describe("normalizeForm — the new fields", () => {
  it("opens a saved pre-loan form on developer installments with the loan off", () => {
    const old = { ...DEFAULT_FORM } as Record<string, unknown>;
    for (const k of ["purchaseKind", "loanEnabled", "pledgeRelease", "loanRatesEdited", "resaleYears"]) delete old[k];
    const f = normalizeForm(old);
    expect(f.purchaseKind).toBe("developer-plan");
    expect(f.loanEnabled).toBe(false);
    expect(f.pledgeRelease).toBe("at-end");
  });
  it("replaces an unknown kind, release or frequency with the default", () => {
    const f = normalizeForm({ ...DEFAULT_FORM, purchaseKind: "lease", pledgeRelease: "never", resaleFrequency: "daily" });
    expect(f.purchaseKind).toBe("developer-plan");
    expect(f.pledgeRelease).toBe("at-end");
    expect(f.resaleFrequency).toBe("yearly");
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run src/app/lib/capacityForm.test.ts`
Expected: FAIL — unknown fields.

- [ ] **Step 4: Implement**

In `src/app/lib/capacityForm.ts`:

Imports — add `type LoanInput, type PledgeRelease, type PurchaseInput, type PurchaseKind` to the `@/lib/capacity` import.

Add to `CapacityForm` (after `testPrice`):

```ts
  purchaseKind: PurchaseKind;
  /** developer-cash: % off the installment price; blank = none. */
  cashDiscountPct: string;
  /** resale: what the seller still owes the developer. */
  resaleRemaining: string;
  resaleYears: string;
  resaleFrequency: PaymentFrequency;
  loanEnabled: boolean;
  loanSharePct: string;
  loanFlatRatePct: string;
  loanYears: string;
  lendingRatioPct: string;
  certificateRatePct: string;
  pledgeRelease: PledgeRelease;
  /** False until the user edits a bank rate — until then they are labelled as examples. */
  loanRatesEdited: boolean;
```

Add to `DEFAULT_FORM`:

```ts
  purchaseKind: "developer-plan",
  cashDiscountPct: "",
  resaleRemaining: "",
  resaleYears: "4",
  resaleFrequency: "yearly",
  loanEnabled: false,
  loanSharePct: "100",
  // Examples, labelled as such until edited — never mistaken for a quote.
  loanFlatRatePct: "12",
  loanYears: "5",
  lendingRatioPct: "100",
  certificateRatePct: "11",
  pledgeRelease: "at-end",
  loanRatesEdited: false,
```

Extend `FormField` with the eight new names listed in Interfaces.

Replace `FIELD_ORDER` with:

```ts
const FIELD_ORDER: readonly FormField[] = [
  "cashDiscountPct",
  "resaleRemaining",
  "resaleYears",
  "startingCapital",
  "currency",
  "effectiveRatePct",
  "nominalRatePct",
  "returnFeePct",
  "safetyBuffer",
  "keepPct",
  "planYears",
  "downPaymentPct",
  "yearPcts",
  "loanSharePct",
  "loanFlatRatePct",
  "loanYears",
  "certificateRatePct",
  "lendingRatioPct",
  "incomeAmount",
  "incomeIncreasePct",
  "maintenancePct",
  "maintenanceYear",
  "finishingPct",
  "finishingYear",
  "testPrice",
];

/** The developer-plan fields — hidden for a resale, collapsed for a cash purchase. */
export const PLAN_FIELDS: readonly FormField[] = ["planYears", "downPaymentPct", "yearPcts"];
```

Add to `ENGINE_FIELDS`:

```ts
  "purchase.cashDiscount": "cashDiscountPct",
  "purchase.resaleRemaining": "resaleRemaining",
  "purchase.resaleYears": "resaleYears",
  "loan.share": "loanSharePct",
  "loan.flatRate": "loanFlatRatePct",
  "loan.years": "loanYears",
  "loan.lendingRatio": "lendingRatioPct",
  "loan.certificateRate": "certificateRatePct",
```

In `parseForm`, replace the `planYears` / `downPayment` / `schedule` block with:

```ts
  const kind = form.purchaseKind;
  // A resale has no plan on screen: read its fields quietly (the engine
  // ignores them for a resale) so a stale value can never block the result.
  const quiet = kind === "resale";
  const planNumber = (field: FormField, raw: string, label: string, fallback: number) =>
    quiet ? (parseNumber(raw) ?? fallback) : required(field, raw, label);

  const planYears = planNumber("planYears", form.planYears, "Plan length", 1);
  const downPayment = planNumber("downPaymentPct", form.downPaymentPct, "Down payment", 0) / 100;

  const schedule: CalculatorInputs["schedule"] =
    form.scheduleMode === "custom" && !quiet
      ? {
          downPayment,
          planYears,
          mode: "custom",
          yearShares: form.yearPcts.map((p, i) => optional(`year-${i}`, p, `Year ${i + 1} share`) / 100),
          frequency: form.frequency,
        }
      : { downPayment, planYears, mode: "equal", frequency: form.frequency };

  const purchase: PurchaseInput = {
    kind,
    cashDiscount: kind === "developer-cash" ? optional("cashDiscountPct", form.cashDiscountPct, "Cash discount") / 100 : 0,
    resaleRemaining: kind === "resale" ? required("resaleRemaining", form.resaleRemaining, "What's still owed") : 0,
    resaleYears: kind === "resale" ? required("resaleYears", form.resaleYears, "Years left") : 1,
    resaleFrequency: form.resaleFrequency,
  };

  const loan: LoanInput | undefined = form.loanEnabled
    ? {
        enabled: true,
        share: required("loanSharePct", form.loanSharePct, "Loan share") / 100,
        flatRate: required("loanFlatRatePct", form.loanFlatRatePct, "Flat rate") / 100,
        years: required("loanYears", form.loanYears, "Loan length"),
        lendingRatio: required("lendingRatioPct", form.lendingRatioPct, "Lending ratio") / 100,
        certificateRate: optional("certificateRatePct", form.certificateRatePct, "Certificate rate") / 100,
        release: form.pledgeRelease,
      }
    : undefined;
```

and add to the `inputs` object literal, after `minKeptShare`:

```ts
    purchase,
    ...(loan ? { loan } : {}),
```

Replace `normalizeForm`'s loop body so enums are checked:

```ts
/** String fields that must be one of a few values; anything else falls back to the default. */
const CHOICES: Partial<Record<keyof CapacityForm, readonly string[]>> = {
  purchaseKind: ["developer-plan", "developer-cash", "resale"],
  pledgeRelease: ["at-end", "gradual"],
  resaleFrequency: ["yearly", "quarterly", "monthly"],
};
```

and inside the `else` branch:

```ts
      const allowed = CHOICES[key];
      out[key] = typeof val === typeof def && (!allowed || allowed.includes(val as string)) ? val : def;
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/app/lib`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/lib/capacityForm.ts src/app/lib/capacityForm.test.ts
git commit -m "Capacity form: purchase kind, resale and loan fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```

---

### Task 6: The deal in words — `describeDeal` and `loanVerdict`

**Files:**
- Create: `src/app/lib/dealText.ts`
- Test: `src/app/lib/dealText.test.ts`

**Interfaces:**
- Consumes: `CalculatorInputs`, `SimulationResult`, `Comparison`, `purchaseOf`, `DEFAULT_STEP` from `@/lib/capacity`.
- Produces:
  - `type DealTone = "in" | "out" | "held"`
  - `type DealPart = string | { amount: number; tone: DealTone }`
  - `type DealSentence = DealPart[]`
  - `describeDeal(inputs: CalculatorInputs, sim: SimulationResult): DealSentence[]`
  - `type LoanVerdictKind = "loan-better" | "no-loan-better" | "same" | "neither"`
  - `interface LoanVerdict { kind: LoanVerdictKind; difference: number; interest: number; certificateInterest: number; discountSaved: number }`
  - `loanVerdict(inputs: CalculatorInputs, comparison: Comparison, step?: number): LoanVerdict`

- [ ] **Step 1: Write the failing tests**

Create `src/app/lib/dealText.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { REFERENCE } from "@/lib/capacity/fixtures";
import { simulate, type CalculatorInputs, type Comparison, type SimulationResult } from "@/lib/capacity";
import { describeDeal, loanVerdict, type DealSentence } from "./dealText";

const RESALE_DEAL: CalculatorInputs = {
  ...REFERENCE,
  startingCapital: 20_000_000,
  maintenance: { share: 0, year: 1 },
  purchase: { kind: "resale", cashDiscount: 0, resaleRemaining: 5_000_000, resaleYears: 4, resaleFrequency: "yearly" },
  loan: { enabled: true, share: 0.9, flatRate: 0.12, years: 5, lendingRatio: 1, certificateRate: 0.11, release: "at-end" },
};

const amounts = (s: DealSentence) =>
  s.flatMap((p) => (typeof p === "string" ? [] : [{ amount: Math.round(p.amount), tone: p.tone }]));
const text = (s: DealSentence) => s.map((p) => (typeof p === "string" ? p : "#")).join("");

describe("describeDeal", () => {
  const sentences = describeDeal(RESALE_DEAL, simulate(RESALE_DEAL, 10_000_000));

  it("says who is paid up front, and how much comes from the bank and from savings", () => {
    expect(text(sentences[0])).toBe("You pay the seller # today — # from the bank, # from savings.");
    expect(amounts(sentences[0])).toEqual([
      { amount: 10_000_000, tone: "out" },
      { amount: 9_000_000, tone: "in" },
      { amount: 1_000_000, tone: "out" },
    ]);
  });

  it("says what is locked, what it earns and when it comes back", () => {
    expect(text(sentences[1])).toBe("# of savings is locked as the bank's guarantee, earning # a month; it all comes back after 5 years.");
    expect(amounts(sentences[1])).toEqual([
      { amount: 9_000_000, tone: "held" },
      { amount: 82_500, tone: "in" },
    ]);
  });

  it("lists what is paid after, to the bank and to the developer", () => {
    expect(text(sentences[2])).toBe("Then you pay the bank # a month for 5 years, and the developer # at the end of each year for 4 years.");
    expect(amounts(sentences[2])).toEqual([
      { amount: 240_000, tone: "out" },
      { amount: 1_250_000, tone: "out" },
    ]);
  });

  it("describes the plain developer plan without a bank", () => {
    const s = describeDeal(REFERENCE, simulate(REFERENCE, 8_000_000));
    expect(text(s[0])).toBe("You pay the developer # today as the down payment, from savings.");
    expect(text(s[1])).toBe("Then you pay the developer # at the end of each year for 8 years.");
    expect(amounts(s[1])).toEqual([{ amount: 900_000, tone: "out" }]);
    expect(text(s[2])).toBe("Plus # in extra costs.");
  });

  it("says nothing is left for a cash purchase with no loan", () => {
    const cash: CalculatorInputs = {
      ...REFERENCE,
      maintenance: { share: 0, year: 1 },
      purchase: { kind: "developer-cash", cashDiscount: 0.2, resaleRemaining: 0, resaleYears: 1, resaleFrequency: "yearly" },
    };
    const s = describeDeal(cash, simulate(cash, 5_000_000));
    expect(text(s[0])).toBe("You pay the developer # today — the cash price — from savings.");
    expect(text(s[s.length - 1])).toBe("Nothing is left to pay after that.");
  });

  it("says the pledge comes back bit by bit on a gradual release", () => {
    const g = { ...RESALE_DEAL, loan: { ...RESALE_DEAL.loan!, release: "gradual" as const } };
    expect(text(describeDeal(g, simulate(g, 10_000_000))[1])).toMatch(/comes back bit by bit as you repay, over 5 years\.$/);
  });
});

describe("loanVerdict", () => {
  const sim = simulate(RESALE_DEAL, 10_000_000);
  const result = (maxPrice: number | null, s: SimulationResult | null = sim) => ({ maxPrice, simulation: s });
  const comparison = (a: number | null, b: number | null): Comparison => ({
    horizonYears: 5,
    withLoan: result(a),
    withoutLoan: result(b, null),
    tested: null,
  });

  it("says the loan is better by the difference in maxima", () => {
    const v = loanVerdict(RESALE_DEAL, comparison(11_200_000, 10_000_000));
    expect(v.kind).toBe("loan-better");
    expect(v.difference).toBe(1_200_000);
    expect(v.interest).toBeCloseTo(5_400_000, 4);
    expect(v.certificateInterest).toBeCloseTo(4_950_000, 4);
    expect(v.discountSaved).toBe(0);
  });
  it("says no loan is better when its maximum is higher", () => {
    expect(loanVerdict(RESALE_DEAL, comparison(9_600_000, 10_000_000)).kind).toBe("no-loan-better");
  });
  it("calls it the same within one solver step", () => {
    expect(loanVerdict(RESALE_DEAL, comparison(10_001_000, 10_000_000)).kind).toBe("same");
  });
  it("treats an unaffordable side as 0, and both unaffordable as neither", () => {
    expect(loanVerdict(RESALE_DEAL, comparison(3_000_000, null)).kind).toBe("loan-better");
    expect(loanVerdict(RESALE_DEAL, comparison(null, null)).kind).toBe("neither");
  });
  it("counts the cash discount saved at the with-loan maximum for a cash purchase", () => {
    const cash = { ...RESALE_DEAL, purchase: { ...RESALE_DEAL.purchase!, kind: "developer-cash" as const, cashDiscount: 0.3 } };
    expect(loanVerdict(cash, comparison(10_000_000, 8_000_000)).discountSaved).toBeCloseTo(3_000_000, 6);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/app/lib/dealText.test.ts`
Expected: FAIL — `Cannot find module './dealText'`.

- [ ] **Step 3: Implement**

Create `src/app/lib/dealText.ts`:

```ts
import {
  DEFAULT_STEP,
  purchaseOf,
  type CalculatorInputs,
  type Comparison,
  type PaymentFrequency,
  type SimulationResult,
} from "@/lib/capacity";

/**
 * The deal read back in plain sentences, and the loan's verdict — so a
 * reader can check "did I enter it right?" and "is the loan worth it?"
 * before reading a chart. Pure (no React): amounts stay numbers with a tone
 * — money in, money out, or locked — and the component formats and colours
 * them by the money rule.
 */

export type DealTone = "in" | "out" | "held";
export type DealPart = string | { amount: number; tone: DealTone };
export type DealSentence = DealPart[];

const PER_YEAR: Record<PaymentFrequency, number> = { yearly: 1, quarterly: 4, monthly: 12 };
const EVERY: Record<PaymentFrequency, string> = {
  yearly: "at the end of each year",
  quarterly: "every quarter",
  monthly: "a month",
};
const years = (n: number) => (n === 1 ? "1 year" : `${n} years`);

export function describeDeal(inputs: CalculatorInputs, sim: SimulationResult): DealSentence[] {
  const purchase = purchaseOf(inputs);
  const loan = sim.loan && sim.loan.amount > 0 ? sim.loan : null;
  const terms = inputs.loan;
  const out: DealSentence[] = [];

  const who = purchase.kind === "resale" ? "the seller" : "the developer";
  const what =
    purchase.kind === "developer-plan" ? " as the down payment" : purchase.kind === "developer-cash" ? " — the cash price" : "";
  const first: DealSentence = [`You pay ${who} `, { amount: sim.upFront, tone: "out" }, ` today${what}`];
  if (loan) {
    first.push(" — ", { amount: loan.amount, tone: "in" }, " from the bank, ", { amount: sim.upFrontFromFund, tone: "out" }, " from savings.");
  } else {
    first.push(purchase.kind === "developer-cash" ? " — from savings." : ", from savings.");
  }
  out.push(first);

  if (loan && terms && loan.pledge > 0) {
    out.push([
      { amount: loan.pledge, tone: "held" },
      " of savings is locked as the bank's guarantee, earning ",
      { amount: (loan.pledge * terms.certificateRate) / 12, tone: "in" },
      " a month; ",
      terms.release === "at-end"
        ? `it all comes back after ${years(terms.years)}.`
        : `it comes back bit by bit as you repay, over ${years(terms.years)}.`,
    ]);
  }

  const clauses: DealSentence[] = [];
  if (loan && terms) {
    clauses.push(["the bank ", { amount: loan.monthlyInstallment, tone: "out" }, ` a month for ${years(terms.years)}`]);
  }
  const developer = developerClause(inputs, sim);
  if (developer) clauses.push(developer);
  out.push(
    clauses.length === 0
      ? ["Nothing is left to pay after that."]
      : ["Then you pay ", ...clauses.flatMap((c, i) => (i === 0 ? c : [", and ", ...c])), "."],
  );

  if (sim.totalExtraCosts > 0) out.push(["Plus ", { amount: sim.totalExtraCosts, tone: "out" }, " in extra costs."]);
  return out;
}

/** What is owed to the developer after the up-front payment, per payment when it is an even split. */
function developerClause(inputs: CalculatorInputs, sim: SimulationResult): DealSentence | null {
  const purchase = purchaseOf(inputs);
  if (purchase.kind === "developer-cash" || sim.totalInstallments <= 0) return null;
  const s = inputs.schedule;
  const frequency = purchase.kind === "resale" ? purchase.resaleFrequency : s.frequency;
  const n = purchase.kind === "resale" ? purchase.resaleYears : s.planYears;
  if (purchase.kind === "developer-plan" && s.mode === "custom") {
    return ["the developer ", { amount: sim.totalInstallments, tone: "out" }, ` over ${years(n)}`];
  }
  return [
    "the developer ",
    { amount: sim.totalInstallments / (n * PER_YEAR[frequency]), tone: "out" },
    ` ${EVERY[frequency]} for ${years(n)}`,
  ];
}

export type LoanVerdictKind = "loan-better" | "no-loan-better" | "same" | "neither";

export interface LoanVerdict {
  kind: LoanVerdictKind;
  /** With-loan maximum − without-loan maximum; an unaffordable side counts as 0. */
  difference: number;
  interest: number;
  certificateInterest: number;
  /** A cash purchase's discount at the with-loan maximum; 0 otherwise. */
  discountSaved: number;
}

export function loanVerdict(inputs: CalculatorInputs, comparison: Comparison, step = DEFAULT_STEP): LoanVerdict {
  const a = comparison.withLoan.maxPrice;
  const b = comparison.withoutLoan.maxPrice;
  const loan = comparison.withLoan.simulation?.loan ?? null;
  const purchase = purchaseOf(inputs);
  const why = {
    interest: loan?.totalInterest ?? 0,
    certificateInterest: loan?.certificateInterest ?? 0,
    discountSaved: purchase.kind === "developer-cash" && a !== null ? a * purchase.cashDiscount : 0,
  };
  if (a === null && b === null) return { kind: "neither", difference: 0, ...why };
  const difference = (a ?? 0) - (b ?? 0);
  // The maxima sit on the solver's grid; one step apart is the same answer.
  const kind = Math.abs(difference) <= step ? "same" : difference > 0 ? "loan-better" : "no-loan-better";
  return { kind, difference, ...why };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/app/lib/dealText.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/lib/dealText.ts src/app/lib/dealText.test.ts
git commit -m "Capacity: read the deal back in sentences, and the loan's verdict

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```

---

### Task 7: "How are you buying?" — the purchase picker and per-kind plan card

**Files:**
- Create: `src/app/components/capacity/PurchasePicker.tsx`
- Modify: `src/app/components/capacity/CapacityCalculator.tsx`

**Interfaces:**
- Consumes: `CapacityForm` fields from Task 5, `PLAN_FIELDS`, `CalcField`, `useFormErrors`, `Segmented`, `Card`.
- Produces: `default function PurchasePicker({ form, update, currency }: { form: CapacityForm; update: (patch: Partial<CapacityForm>) => void; currency: string })`.

- [ ] **Step 1: Create the picker**

Create `src/app/components/capacity/PurchasePicker.tsx`:

```tsx
"use client";

import type { PaymentFrequency, PurchaseKind } from "@/lib/capacity";
import type { CapacityForm } from "@/app/lib/capacityForm";
import { formatMoney } from "@/app/lib/format";
import { parseNumber } from "@/app/lib/numbers";
import { Segmented } from "../ui";
import { CalcField } from "./formErrors";

const CHOICES: { kind: PurchaseKind; title: string; line: string }[] = [
  {
    kind: "developer-plan",
    title: "From the developer, in installments",
    line: "Down payment now, the rest over the developer's plan.",
  },
  { kind: "developer-cash", title: "From the developer, in cash", line: "Pay the cash price up front, usually at a discount." },
  { kind: "resale", title: "Resale", line: "Pay a seller in cash and take over what they still owe the developer." },
];

const EVERY: Record<PaymentFrequency, string> = {
  yearly: "a year, at the end of each year",
  quarterly: "a quarter",
  monthly: "a month",
};
const PER_YEAR: Record<PaymentFrequency, number> = { yearly: 1, quarterly: 4, monthly: 12 };

/**
 * The first question the calculator asks, in words before any number: how
 * the property is bought. Three real radio buttons dressed as cards (native
 * arrow-key and screen-reader behaviour), then only the fields that kind
 * needs. Switching keeps every kind's values, so comparing costs nothing.
 */
export default function PurchasePicker({
  form,
  update,
  currency,
}: {
  form: CapacityForm;
  update: (patch: Partial<CapacityForm>) => void;
  currency: string;
}) {
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="sr-only">How are you buying?</legend>
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-1">
          {CHOICES.map((c) => {
            const on = form.purchaseKind === c.kind;
            return (
              <label
                key={c.kind}
                className={`pressable flex min-h-[44px] cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
                  on ? "border-accent/60 bg-accent/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
                }`}
              >
                <input
                  type="radio"
                  name="purchase-kind"
                  value={c.kind}
                  checked={on}
                  onChange={() => update({ purchaseKind: c.kind })}
                  className="sr-only"
                />
                <span className="text-sm font-semibold text-white">{c.title}</span>
                <span className="text-xs leading-snug text-white/50">{c.line}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {form.purchaseKind === "developer-cash" && <CashFields form={form} update={update} />}
      {form.purchaseKind === "resale" && <ResaleFields form={form} update={update} currency={currency} />}
    </div>
  );
}

function CashFields({ form, update }: { form: CapacityForm; update: (patch: Partial<CapacityForm>) => void }) {
  const pct = parseNumber(form.cashDiscountPct) ?? 0;
  return (
    <CalcField
      field="cashDiscountPct"
      label="Cash discount"
      hint={
        pct > 0 && pct < 100
          ? `You pay ${Number((100 - pct).toFixed(2))}% of the installment price, all up front.`
          : "How much less the developer charges for paying everything now."
      }
      value={form.cashDiscountPct}
      onChange={(v) => update({ cashDiscountPct: v })}
      suffix="% off"
      placeholder="0"
    />
  );
}

function ResaleFields({
  form,
  update,
  currency,
}: {
  form: CapacityForm;
  update: (patch: Partial<CapacityForm>) => void;
  currency: string;
}) {
  const remaining = parseNumber(form.resaleRemaining);
  const yearsLeft = parseNumber(form.resaleYears);
  const each =
    remaining !== null && remaining > 0 && yearsLeft !== null && yearsLeft >= 1
      ? remaining / (yearsLeft * PER_YEAR[form.resaleFrequency])
      : null;
  return (
    <div className="space-y-4">
      <CalcField
        field="resaleRemaining"
        label="Still owed to the developer"
        hint="What the seller has left to pay on their contract — you take it over. 0 if it is paid off."
        group
        value={form.resaleRemaining}
        onChange={(v) => update({ resaleRemaining: v })}
        suffix={currency}
        placeholder="5,000,000"
      />
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-end gap-3">
        <CalcField
          field="resaleYears"
          label="Years left"
          value={form.resaleYears}
          onChange={(v) => update({ resaleYears: v })}
          placeholder="4"
        />
        <div>
          <span className="mb-1.5 block text-xs font-medium text-white/60">Paid</span>
          <Segmented<PaymentFrequency>
            ariaLabel="How often the remaining balance is paid"
            value={form.resaleFrequency}
            onChange={(resaleFrequency) => update({ resaleFrequency })}
            options={[
              { value: "yearly", label: "Yearly" },
              { value: "quarterly", label: "Quarterly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
        </div>
      </div>
      {each !== null && (
        <p className="-mt-2 text-xs text-white/50">
          That&apos;s <span className="font-mono tabular-nums text-white">{formatMoney(each, currency)}</span>{" "}
          {EVERY[form.resaleFrequency]}.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the calculator, and make the plan card follow the kind**

In `CapacityCalculator.tsx`:

1. Imports: add `import PurchasePicker from "./PurchasePicker";` and `PLAN_FIELDS` to the `@/app/lib/capacityForm` import.
2. State: under `detailsFor`, add `const [planOpen, setPlanOpen] = useState(false);`.
3. Directly after `<LiveResult … />`, insert:

```tsx
            <Card title="How are you buying?">
              <PurchasePicker form={form} update={update} currency={currency} />
            </Card>
```

4. Replace the `<Card title="Payment plan">…</Card>` block with:

```tsx
            {form.purchaseKind !== "resale" && (
              <Card title={form.purchaseKind === "developer-cash" ? "The installment alternative" : "Payment plan"}>
                {form.purchaseKind === "developer-cash" &&
                !planOpen &&
                !PLAN_FIELDS.some((f) => byField[f] !== undefined) ? (
                  <PlanSummaryLine form={form} onEdit={() => setPlanOpen(true)} />
                ) : (
                  <ScheduleEditor form={form} update={update} />
                )}
              </Card>
            )}
```

5. Add at the bottom of the file:

```tsx
/**
 * A cash purchase still carries the developer's plan — it is what "without
 * the loan" is compared against — but it is not what the user is deciding,
 * so it sits as one line until asked for. A plan with a problem is always
 * shown open, so its error is never hidden.
 */
function PlanSummaryLine({ form, onEdit }: { form: CapacityForm; onEdit: () => void }) {
  const freq = { yearly: "yearly", quarterly: "quarterly", monthly: "monthly" }[form.frequency];
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-white/60">
        Compared against the developer&apos;s plan:{" "}
        <span className="text-white">
          {form.downPaymentPct || "0"}% down · {form.planYears} years · {freq}
        </span>
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="min-h-[44px] shrink-0 cursor-pointer rounded-lg px-3 text-xs font-medium text-accent transition-colors hover:bg-white/5"
      >
        Edit
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: no errors.

- [ ] **Step 4: See it**

Start the dev server in tmux (`tmux kill-session -t my-wallet-dev 2>/dev/null; mkdir -p ~/logs; tmux new -d -s my-wallet-dev "npm run dev 2>&1 | tee ~/logs/my-wallet-dev.log"`), sign in, open `/real-estate` at 390×844 and at 1280×800. Check: three cards stack on the phone and stack in the narrow desktop column; Tab reaches the group and arrow keys move the selection with a visible focus ring; Resale shows the three fields and "That's 1,250,000 EGP a year, at the end of each year." for 5,000,000 / 4 / yearly; Developer cash shows the discount and the one-line plan with Edit; a resale result appears with plan fields left blank.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/capacity/PurchasePicker.tsx src/app/components/capacity/CapacityCalculator.tsx
git commit -m "Real Estate: ask how the property is bought before any number

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```

---

### Task 8: The loan card

**Files:**
- Create: `src/app/components/capacity/Explain.tsx`
- Create: `src/app/components/capacity/LoanCard.tsx`
- Modify: `src/app/components/capacity/CapacityCalculator.tsx`

**Interfaces:**
- Consumes: form fields (Task 5), `LoanSummary` (Task 1), `decliningRateFromFlat` (Task 2), `CheckRow`, `Segmented`, `CalcField`, `useFormErrors`, `formatMoney`, `formatPct`.
- Produces:
  - `default function Explain({ term, children }: { term: string; children: ReactNode })`
  - `default function LoanCard({ form, update, loan, atPrice, currency }: { form: CapacityForm; update: (patch: Partial<CapacityForm>) => void; loan: LoanSummary | null; atPrice: "max" | "test"; currency: string })`

- [ ] **Step 1: Create the glossary disclosure**

Create `src/app/components/capacity/Explain.tsx`:

```tsx
import type { ReactNode } from "react";

/**
 * "What's this?" for a term the reader may not know. A native <details>, so
 * it opens by tap, by keyboard, and for a screen reader — never a hover
 * tooltip a phone cannot show.
 */
export default function Explain({ term, children }: { term: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1 text-xs font-medium text-accent [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 4 4 4-4 4" />
        </svg>
        {term}
      </summary>
      <p className="-mt-1 mb-2 pl-[1.125rem] text-xs leading-relaxed text-white/60">{children}</p>
    </details>
  );
}
```

- [ ] **Step 2: Create the loan card**

Create `src/app/components/capacity/LoanCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { decliningRateFromFlat, type LoanSummary, type PledgeRelease } from "@/lib/capacity";
import type { CapacityForm } from "@/app/lib/capacityForm";
import { formatMoney, formatPct } from "@/app/lib/format";
import { parseNumber } from "@/app/lib/numbers";
import { CheckRow, Segmented } from "../ui";
import Explain from "./Explain";
import { CalcField, useFormErrors } from "./formErrors";

/**
 * Paying with a bank loan against certificates — closed until asked for.
 * Fields come in the order a person decides: how much to borrow, what the
 * bank charges, what the certificates pay; the rarely-changed bank terms sit
 * behind a one-line sentence. Under each field, the offer read back in money
 * AT THE PRICE THE RESULTS SHOW (the form has no price — it is solved for),
 * which is what makes a flat rate stop being confusing.
 */
export default function LoanCard({
  form,
  update,
  loan,
  atPrice,
  currency,
}: {
  form: CapacityForm;
  update: (patch: Partial<CapacityForm>) => void;
  /** The loan at the shown price; null before there is a result. */
  loan: LoanSummary | null;
  atPrice: "max" | "test";
  currency: string;
}) {
  const { errorFor } = useFormErrors();
  const [termsOpen, setTermsOpen] = useState(false);
  const money = (n: number) => formatMoney(n, currency);
  const at = atPrice === "max" ? "at the maximum" : "at the price you're checking";

  const flat = parseNumber(form.loanFlatRatePct);
  const years = parseNumber(form.loanYears);
  const cert = parseNumber(form.certificateRatePct);
  const declining =
    flat !== null && years !== null && years >= 1 && flat >= 0 ? decliningRateFromFlat(flat / 100, years) : null;
  const yearsText = years === 1 ? "1 year" : `${form.loanYears} years`;
  const ratio = form.lendingRatioPct.trim() || "—";
  const releaseText = form.pledgeRelease === "at-end" ? "when the loan is paid off" : "bit by bit as you repay";
  const termsForcedOpen = errorFor("lendingRatioPct") !== undefined;

  return (
    <div className="space-y-4">
      <CheckRow
        checked={form.loanEnabled}
        onChange={(loanEnabled) => update({ loanEnabled })}
        label="Pay with a bank loan"
        hint="Borrow against your certificates and pay the bank monthly instead."
      />

      {form.loanEnabled && (
        <div className="space-y-4">
          {!form.loanRatesEdited && (
            <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
              The rates below are <span className="font-semibold text-white">examples</span> — enter your bank&apos;s offer.
            </p>
          )}

          <CalcField
            field="loanSharePct"
            label="Borrow"
            hint={loan ? `= ${money(loan.amount)} ${at}.` : "Of what you pay up front; the rest comes from savings."}
            value={form.loanSharePct}
            onChange={(v) => update({ loanSharePct: v })}
            suffix="% of the up-front payment"
            placeholder="100"
          />

          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <CalcField
                field="loanFlatRatePct"
                label="Flat rate"
                value={form.loanFlatRatePct}
                onChange={(v) => update({ loanFlatRatePct: v, loanRatesEdited: true })}
                suffix="% a year"
                placeholder="12"
              />
              <CalcField
                field="loanYears"
                label="Years"
                value={form.loanYears}
                onChange={(v) => update({ loanYears: v })}
                placeholder="5"
              />
            </div>
            <p className="mt-1.5 text-xs leading-snug text-white/60" aria-live="polite">
              {loan ? (
                <>
                  <span className="font-mono font-semibold tabular-nums text-loss">{money(loan.monthlyInstallment)} / month</span>{" "}
                  for {yearsText} · {money(loan.totalInterest)} interest in total
                  {declining !== null && <> · ≈ {formatPct(declining, 1)} on a declining balance</>} ({at})
                </>
              ) : declining !== null ? (
                <>≈ {formatPct(declining, 1)} on a declining balance</>
              ) : null}
            </p>
            <Explain term="What's a flat rate?">
              Interest on the full loan for every year, even as you repay it — so 12% flat over 5 years costs about what
              20% does on a normal loan. The line above shows the normal-loan rate for your numbers.
            </Explain>
          </div>

          <div>
            <CalcField
              field="certificateRatePct"
              label="Certificate rate"
              hint={
                loan && cert !== null
                  ? `Your ${money(loan.pledge)} in certificates pays you ${money((loan.pledge * cert) / 100 / 12)} / month while it is pledged (${at}).`
                  : "What your certificates pay a year, after tax."
              }
              value={form.certificateRatePct}
              onChange={(v) => update({ certificateRatePct: v, loanRatesEdited: true })}
              suffix="% a year"
              placeholder="11"
            />
            <Explain term="What's a pledge?">
              Savings you put in certificates at the bank as security for the loan. They keep paying you interest, but
              you cannot spend them until the bank releases them — so the safety buffer does not count them.
            </Explain>
          </div>

          <details
            open={termsOpen || termsForcedOpen}
            onToggle={(e) => setTermsOpen(e.currentTarget.open)}
            className="rounded-lg border border-white/10 bg-white/[0.03]"
          >
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs text-white/60 [&::-webkit-details-marker]:hidden">
              <span>
                Bank lends <span className="text-white">{ratio}%</span> of the certificates · releases them{" "}
                <span className="text-white">{releaseText}</span>
              </span>
              <span className="shrink-0 font-medium text-accent">Change</span>
            </summary>
            <div className="space-y-4 border-t border-white/10 px-3 py-3">
              <CalcField
                field="lendingRatioPct"
                label="Bank lends"
                hint="Most banks lend 90–100%. Your pledge is the loan divided by this."
                value={form.lendingRatioPct}
                onChange={(v) => update({ lendingRatioPct: v })}
                suffix="% of the certificates"
                placeholder="100"
              />
              <div>
                <span className="mb-1.5 block text-xs font-medium text-white/60">Certificates come back</span>
                <Segmented<PledgeRelease>
                  ariaLabel="When the bank releases the certificates"
                  value={form.pledgeRelease}
                  onChange={(pledgeRelease) => update({ pledgeRelease })}
                  options={[
                    { value: "at-end", label: "When the loan ends" },
                    { value: "gradual", label: "As I repay" },
                  ]}
                />
              </div>
              <Explain term="What's the lending ratio?">
                How much the bank lends for each pound of certificates. At 100% a 9M loan needs 9M pledged; at 90% it
                needs 10M.
              </Explain>
              <Explain term="What does release mean?">
                When the bank hands your certificates back so you can spend them again — all at once when the loan is
                paid off, or a part every month as what you owe goes down.
              </Explain>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Place it after the plan**

In `CapacityCalculator.tsx`, import `LoanCard` and, directly after the plan card block from Task 7, add:

```tsx
            <Card title="Bank loan">
              <LoanCard
                form={form}
                update={update}
                loan={showing?.loan ?? null}
                atPrice={showing === tested ? "test" : "max"}
                currency={currency}
              />
            </Card>
```

`showing` and `tested` are declared above the JSX already; no reordering is needed.

- [ ] **Step 4: Type-check, lint, look**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: clean.
In the browser (dev server from Task 7): turn the loan on → the examples notice shows; type in Flat rate → it disappears; with a resale (10M max region) the line reads "… / month for 5 years · … interest in total · ≈ 20.3% on a declining balance (at the maximum)"; set lending ratio to 0 → the bank terms open themselves and the error shows; each "What's …?" opens with Enter/Space.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/capacity/Explain.tsx src/app/components/capacity/LoanCard.tsx src/app/components/capacity/CapacityCalculator.tsx
git commit -m "Real Estate: the bank loan card, read back in money

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```

---

### Task 9: Results — "Your deal", the verdict, the comparison, check this deal

**Files:**
- Create: `src/app/components/capacity/DealSummary.tsx`
- Create: `src/app/components/capacity/LoanComparison.tsx`
- Modify: `src/app/components/capacity/CapacityCalculator.tsx`
- Modify: `src/app/components/capacity/LiveResult.tsx`

**Interfaces:**
- Consumes: `compare` (Task 4), `describeDeal`, `loanVerdict` (Task 6), `purchaseOf`.
- Produces:
  - `default function DealSummary({ inputs, sim, atPrice, currency }: { inputs: CalculatorInputs; sim: SimulationResult; atPrice: "max" | "test"; currency: string })`
  - `default function LoanComparison({ inputs, comparison, currency }: { inputs: CalculatorInputs; comparison: Comparison; currency: string })`
  - `LiveResult` gains optional prop `loanDifference?: number | null`.

- [ ] **Step 1: "Your deal"**

Create `src/app/components/capacity/DealSummary.tsx`:

```tsx
import type { CalculatorInputs, SimulationResult } from "@/lib/capacity";
import { describeDeal, type DealTone } from "@/app/lib/dealText";
import { formatMoney } from "@/app/lib/format";
import { Card } from "../ui";

const TONE: Record<DealTone, string> = { in: "text-gain", out: "text-loss", held: "text-white" };

/**
 * The deal stated as sentences, before any chart: the answer to "did I enter
 * it right?". Money in is `gain`, money out `loss`, locked money white — the
 * colour rule carries the meaning of every figure.
 */
export default function DealSummary({
  inputs,
  sim,
  atPrice,
  currency,
}: {
  inputs: CalculatorInputs;
  sim: SimulationResult;
  atPrice: "max" | "test";
  currency: string;
}) {
  return (
    <Card title="Your deal" className="animate-rise" style={{ animationDelay: "40ms" }}>
      <p className="-mt-1 mb-2 text-[11px] text-white/40">
        {atPrice === "max" ? "At the maximum price." : "At the price you're checking."}
      </p>
      <div className="space-y-1.5 text-sm leading-relaxed text-white/70">
        {describeDeal(inputs, sim).map((sentence, i) => (
          <p key={i}>
            {sentence.map((part, j) =>
              typeof part === "string" ? (
                part
              ) : (
                <strong key={j} className={`font-mono font-semibold tabular-nums ${TONE[part.tone]}`}>
                  {formatMoney(part.amount, currency)}
                </strong>
              ),
            )}
          </p>
        ))}
      </div>
    </Card>
  );
}
```

(If `Card` does not accept `style`, it does — `ui.tsx` declares `style?: CSSProperties`.)

- [ ] **Step 2: The verdict and the comparison**

Create `src/app/components/capacity/LoanComparison.tsx`:

```tsx
import { purchaseOf, type CalculatorInputs, type Comparison, type SimulationResult } from "@/lib/capacity";
import { loanVerdict } from "@/app/lib/dealText";
import { formatMoney } from "@/app/lib/format";
import { Card } from "../ui";

/**
 * "Is the loan worth it?" — one verdict line, one line of why, then the
 * same five rows for each side. A comparison is a position, not money
 * moving, so nothing here is green or red; the larger figure carries a small
 * "higher" tag instead.
 */
export default function LoanComparison({
  inputs,
  comparison,
  currency,
}: {
  inputs: CalculatorInputs;
  comparison: Comparison;
  currency: string;
}) {
  const v = loanVerdict(inputs, comparison);
  const money = (n: number) => formatMoney(n, currency);
  const figure = (n: number) => formatMoney(n, "");
  const a = comparison.withLoan;
  const b = comparison.withoutLoan;
  const otherLabel = purchaseOf(inputs).kind === "developer-cash" ? "Installments" : "Without loan";

  const headline =
    v.kind === "loan-better"
      ? `The loan lets you afford ${money(v.difference)} more.`
      : v.kind === "no-loan-better"
        ? `Without the loan you can afford ${money(-v.difference)} more.`
        : v.kind === "same"
          ? "Same either way — the loan only changes when you pay."
          : "Neither works with these numbers.";
  const why = [
    `Interest ${money(v.interest)}`,
    `your certificates earn back ${money(v.certificateInterest)} while pledged`,
    ...(v.discountSaved > 0 ? [`the cash discount saves ${money(v.discountSaved)}`] : []),
  ].join(" · ");

  const sim = (s: SimulationResult | null, pick: (s: SimulationResult) => number) => (s ? pick(s) : null);
  const rows: { label: string; with: number | null; without: number | null; compare: boolean }[] = [
    { label: "Max you can afford", with: a.maxPrice, without: b.maxPrice, compare: true },
    { label: "Lowest balance", with: sim(a.simulation, (s) => s.minBalance), without: sim(b.simulation, (s) => s.minBalance), compare: true },
    { label: "Ends with", with: sim(a.simulation, (s) => s.finalBalance), without: sim(b.simulation, (s) => s.finalBalance), compare: true },
    { label: "Interest paid", with: sim(a.simulation, (s) => s.loan?.totalInterest ?? 0), without: 0, compare: false },
    { label: "Net cost of the loan", with: sim(a.simulation, (s) => s.loan?.netCost ?? 0), without: null, compare: false },
  ];

  return (
    <Card className="animate-rise" style={{ animationDelay: "80ms" }}>
      <h2 className="text-base font-semibold text-white" aria-live="polite">{headline}</h2>
      {v.kind !== "neither" && <p className="mt-1 text-xs leading-snug text-white/50">{why}.</p>}

      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 text-xs">
        <dt className="sr-only">Measure</dt>
        <dd className="pb-1.5 text-right text-[11px] font-medium uppercase tracking-wide text-white/40">With loan</dd>
        <dd className="pb-1.5 text-right text-[11px] font-medium uppercase tracking-wide text-white/40">{otherLabel}</dd>
        {rows.map((r) => {
          const higher = r.compare && r.with !== null && r.without !== null && Math.abs(r.with - r.without) >= 1;
          const cell = (key: string, n: number | null, tag: boolean) => (
            <dd key={key} className="border-t border-white/5 py-2 text-right font-mono tabular-nums text-white">
              {n === null ? <span className="text-white/40">{r.label.startsWith("Max") ? "Nothing" : "—"}</span> : figure(n)}
              {tag && <span className="ml-1.5 rounded bg-white/10 px-1 py-px font-sans text-[10px] text-white/70">higher</span>}
            </dd>
          );
          return [
            <dt key={`${r.label}-l`} className="border-t border-white/5 py-2 text-white/60">{r.label}</dt>,
            cell(`${r.label}-a`, r.with, higher && r.with! > r.without!),
            cell(`${r.label}-b`, r.without, higher && r.without! > r.with!),
          ];
        })}
      </dl>
      <p className="mt-2 text-[11px] text-white/40">All figures in {currency}, over {comparison.horizonYears} years.</p>
    </Card>
  );
}
```

- [ ] **Step 3: Wire the results**

In `CapacityCalculator.tsx`:

1. Imports: add `compare`, `purchaseOf`, `type Comparison` to `@/lib/capacity`; add `import DealSummary from "./DealSummary";` and `import LoanComparison from "./LoanComparison";`.
2. Replace the `capacity` and `tested` memos with:

```tsx
  const loanOn = shown?.loan?.enabled === true;
  // With a loan, one call solves both sides over one horizon; the deal's own
  // maximum is its with-loan side.
  const comparison: Comparison | null = useMemo(
    () => (shown && loanOn ? compare(shown, testPrice) : null),
    [shown, loanOn, testPrice],
  );
  const capacity = useMemo(
    () => (comparison ? comparison.withLoan : shown ? maxFeasiblePrice(shown) : null),
    [comparison, shown],
  );
  const tested = useMemo(
    () => (comparison ? (comparison.tested?.withLoan ?? null) : shown && testPrice !== null ? simulate(shown, testPrice) : null),
    [comparison, shown, testPrice],
  );
  const kind = shown ? purchaseOf(shown).kind : "developer-plan";
```

3. `LiveResult`: pass `loanDifference={comparison ? (comparison.withLoan.maxPrice ?? 0) - (comparison.withoutLoan.maxPrice ?? 0) : null}`.
4. Inside the headline block, after the `Hero` / nothing-affordable branch (still inside the `shown &&` wrapper), add:

```tsx
                  {comparison && <div className="mt-4"><LoanComparison inputs={shown} comparison={comparison} currency={currency} /></div>}
```

5. In the lower grid, as its first child (before the test card), add:

```tsx
                {showing && (
                  <div className="xl:order-0 xl:col-span-2">
                    <DealSummary inputs={shown} sim={showing} atPrice={showing === tested ? "test" : "max"} currency={currency} />
                  </div>
                )}
```

6. The test card: title `"Check this deal"`; `CalcField` `label={kind === "resale" ? "Cash to the seller" : kind === "developer-cash" ? "Installment price" : "Price"}`; `hint="Leave blank to only see the maximum."`; and below the existing `Verdict`, when `comparison?.tested`, add:

```tsx
                  {comparison?.tested && (
                    <Verdict
                      sim={comparison.tested.withoutLoan}
                      capital={shown.startingCapital}
                      buffer={shown.safetyBuffer}
                      currency={currency}
                      label={kind === "developer-cash" ? "On the installment plan" : "Without the loan"}
                    />
                  )}
```

and give the first `Verdict` `label={comparison ? "With the loan" : undefined}`.

7. `Verdict`: add an optional `label?: string` prop rendered before the outcome word (`{label && <span className="text-white/60">{label}: </span>}` inside the `font-semibold` div), and replace the month-0 message with:

```tsx
            ? breach.month === 0
              ? sim.loan && sim.loan.pledge > 0
                ? `The bank's guarantee plus your share of the up-front payment (${money(
                    sim.upFrontFromFund + sim.loan.pledge,
                  )}) leaves the fund ${money(breach.shortfall)} short of the ${money(buffer)} buffer.`
                : `Paying ${money(sim.upFront)} up front leaves the fund ${money(breach.shortfall)} short of the buffer.`
```

8. `Hero`: add a `kind` prop (`PurchaseKind`); title text: `kind === "resale" ? "Most you can pay the seller" : "Maximum buying capacity"`; under the figure for `developer-cash`, the sentence becomes `The highest installment price this deal carries — you pay ${money(sim.upFront)} in cash — without the fund dropping below ${money(buffer)}.`; for resale `The most cash to the seller this deal carries, on top of the ${money(sim.totalInstallments)} still owed to the developer, without the fund dropping below ${money(buffer)}.`; the first tile's label is `kind === "developer-plan" ? "Down payment" : "Paid up front"`; the "Final balance" sub becomes `` `end of year ${sim.horizonYears}` ``. Pass `kind={kind}` where `Hero` is rendered.
9. The "nothing affordable" paragraph: when `loanOn`, append " With a loan, the pledge counts as locked, not spendable — a lower lending ratio or a smaller loan share frees more of your savings."

- [ ] **Step 4: LiveResult shows the loan's difference**

In `LiveResult.tsx`, add the prop `loanDifference?: number | null` and, after the max figure's `<span>` inside the non-broken branch, render:

```tsx
              {loanDifference != null && maxPrice != null && Math.abs(loanDifference) >= 1_000 && (
                <span className="block text-[11px] text-white/50">
                  {loanDifference > 0 ? "+" : "−"}
                  {formatCompact(Math.abs(loanDifference), 2)} with the loan
                </span>
              )}
```

(import `formatCompact` from `@/app/lib/format`). The phone strip's height grows by one line only while a loan is on; `min-h-[56px]` already allows it.

- [ ] **Step 5: Type-check, lint, look**

Run: `npx tsc --noEmit -p . && npm run lint`
Expected: clean.
Browser at 360×740 and 1280×800: with a resale + loan, the verdict line sits under the hero, the two-column comparison does not scroll sideways at 360px, "Your deal" reads three sentences with green/red/white figures, entering a cash-to-seller price in "Check this deal" shows both a "With the loan" and a "Without the loan" verdict, and the sticky strip shows "+1.2M with the loan" (or similar). With the loan off, the page looks exactly as before plus "Your deal".

- [ ] **Step 6: Commit**

```bash
git add src/app/components/capacity
git commit -m "Real Estate: your deal in words, the loan's verdict, both sides compared

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```

---

### Task 10: The chart and the year table with a loan

**Files:**
- Modify: `src/app/components/capacity/BalanceChart.tsx`
- Modify: `src/app/components/capacity/YearTable.tsx`

**Interfaces:**
- Consumes: `MonthPoint.held/certificateInterest/bankInstallment/released`, `YearSummary.pledged/released/certificateInterest/bankInstallments`, `SimulationResult.loan/upFrontFromFund/horizonYears`, `purchaseOf`.
- Produces: no new exports.

- [ ] **Step 1: YearTable — the Bank group and columns**

In `YearTable.tsx`:

1. In the phone card, change `paid` / `fromSavings` to:

```tsx
          const paid = y.downPayment + y.installments + y.extraCosts;
          const bankFlows = y.bankInstallments + y.certificateInterest + y.pledged + y.released;
          // What returns, income and certificate interest did not cover came
          // out of savings; locking and releasing the pledge is shown on its own.
          const fromSavings = paid + y.bankInstallments - y.returns - y.income - y.certificateInterest;
```

2. After the "Covered by" group's `From savings` row, before `Closing`, add:

```tsx
                {bankFlows > 0 && (
                  <>
                    <Row label="Bank" tone="strong" className="mt-1.5" />
                    {y.bankInstallments > 0 && <Row label="Bank installments" value={outflow(y.bankInstallments)} />}
                    {y.certificateInterest > 0 && <Row label="Certificate interest" value={inflow(y.certificateInterest)} />}
                    {y.pledged > 0 && <Row label="Locked as guarantee" value={money(y.pledged)} />}
                    {y.released > 0 && <Row label="Released" value={money(y.released)} />}
                  </>
                )}
```

Certificate interest appears only in the Bank group (`fromSavings` already counts it). Rename the year-1 row `label="Down payment"` to `label="Paid up front"` — the same amount for the original plan, and true for every kind.

3. Desktop table: compute `const hasLoan = years.some((y) => y.bankInstallments > 0 || y.pledged > 0);` at the top of the component. When `hasLoan`, add after the Income header `<th>Bank</th><th>Certificates</th><th>Locked</th>` (same classes) and per row:

```tsx
                {hasLoan && (
                  <>
                    <td className="px-3 py-2 text-right">{outflow(y.bankInstallments)}</td>
                    <td className="px-3 py-2 text-right">{inflow(y.certificateInterest)}</td>
                    <td className="px-3 py-2 text-right text-white/70">
                      {y.pledged > 0 ? money(y.pledged) : y.released > 0 ? `−${money(y.released)}` : dash}
                    </td>
                  </>
                )}
```

Rename the "Down payment" header to "Up front".

4. Caption: append, when `hasLoan`, " Locked is the pledge the bank holds — not spendable, so the buffer does not count it; Closing is the spendable fund."

- [ ] **Step 2: BalanceChart — held line, release label, tooltip, stream frequency**

In `BalanceChart.tsx`:

1. Import `purchaseOf` from `@/lib/capacity`.
2. In `geometry`: include held money in the scale and build a second path:

```tsx
    const totals = points.map((p) => p.balance + p.held);
    const dataMax = Math.max(buffer, capital, keepTarget, ...balances, ...totals);
    ...
    const hasHeld = points.some((p) => p.held > 0);
    const heldPath = hasHeld
      ? [`M${pt(0, capital)}`, ...points.map((p) => `L${pt(p.month, p.balance + p.held)}`)].join(" ")
      : null;
```

and return `heldPath` from the memo; destructure it.
3. Render it BEFORE the main line (so the hero line sits on top), after the area wash:

```tsx
          {heldPath && (
            <path d={heldPath} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.25} strokeLinejoin="round" />
          )}
```

4. Annotations, after the installment note (priority 8):

```tsx
    // 7. The locked certificates: name the muted line once at its START —
    //    it meets the accent line when the pledge comes back, so its end
    //    has nothing to label (the spec's "at its end" adjusted for this),
    //    and mark the month they all come back.
    if (sim.loan && sim.loan.pledge > 0) {
      const first = points[1] ?? points[0];
      note("held", "incl. locked certificates", 9, [
        { x: x(first.month) + 10, y: y(first.balance + first.held) - 6, anchor: "start", v: "above" },
        { x: x(first.month) + 10, y: y(first.balance + first.held) + 6, anchor: "start", v: "below" },
      ], { muted: true });
      if (inputs.loan?.release === "at-end" && sim.loan.months <= months) {
        const m = sim.loan.months;
        markers.push({ id: "release", x: x(m), y: y(points[m].balance), fill: "rgba(255,255,255,0.7)" });
        note("release", `Certificates back +${short(sim.loan.pledge)}`, 6, cliffSpots(m), { muted: false, ...cliffLeader(m) });
      }
    }
```

The cliff helpers work for a jump up as well as down: their spots straddle the step.
5. The installment label's frequency must follow the developer stream:

```tsx
      const p = purchaseOf(inputs);
      const freq = p.kind === "resale" ? p.resaleFrequency : inputs.schedule.frequency;
      const per = freq === "monthly" ? " a month" : freq === "quarterly" ? " a quarter" : "";
```

6. The start label: replace `down` with

```tsx
    const out = sim.upFrontFromFund + (sim.loan?.pledge ?? 0);
    const down = out > 0 ? ` · ${sim.loan ? "paid + locked" : "down payment"} −${short(out)}` : "";
```

7. `aria-label`: start with the spendable meaning and the loan when present:

```tsx
          aria-label={`Spendable fund over ${years} years. Starts at ${money(capital)}; ${
            sim.loan ? `${money(sim.upFrontFromFund)} paid up front and ${money(sim.loan.pledge)} locked as the bank's guarantee` : `a down payment of ${money(sim.downPayment)}`
          }; lowest ${money(sim.minBalance)}, ends at ${money(sim.finalBalance)}. Safety buffer ${money(buffer)}${
            keepTarget > 0 ? `, keep target ${money(keepTarget)}` : ""
          }.`}
```

8. Tooltip flows: extend `Flow["direction"]` to `"in" | "out" | "held"`; in `flowsFor`:

```tsx
  if (point.month === 0) {
    const flows: Flow[] = [];
    if (sim.upFrontFromFund > 0)
      flows.push({ label: sim.loan ? "Paid up front" : "Down payment", amount: sim.upFrontFromFund, direction: "out", sign: -1 });
    if (sim.loan && sim.loan.pledge > 0)
      flows.push({ label: "Locked as guarantee", amount: sim.loan.pledge, direction: "held", sign: -1 });
    return flows;
  }
```

and after the extra cost (every push in `flowsFor`, including the existing Return / Income / Installment / extra-cost ones and the month-0 ones above, also sets `sign`: `-1` for money leaving the spendable fund — "out" flows and "Locked as guarantee" — and `1` otherwise):

```tsx
  if (point.certificateInterest > 0)
    flows.push({ label: "Certificates", amount: point.certificateInterest, direction: "in", sign: 1 });
  if (point.bankInstallment > 0) flows.push({ label: "Bank", amount: point.bankInstallment, direction: "out", sign: -1 });
  if (point.released > 0) flows.push({ label: "Released", amount: point.released, direction: "held", sign: 1 });
```

Add `sign: 1 | -1` to the `Flow` interface. Label the developer installment `"Developer"` when `sim.loan` is set (two installments in one tooltip need names), `"Installment"` otherwise. In `Tooltip`, the `dd` class becomes `f.direction === "in" ? "text-gain" : f.direction === "out" ? "text-loss" : "text-white/70"` and the value `formatSignedMoney(f.sign * f.amount, "")`.
9. Under the hovered value, when `point.held > 0`, add a line `<div className="text-[11px] text-white/40">+ {formatMoney(point.held, currency)} locked</div>` (pass `held` via `point`, already on it).

- [ ] **Step 3: Type-check, lint, test, look**

Run: `npx tsc --noEmit -p . && npm run lint && npm test`
Expected: clean, all tests PASS.
Browser: resale + loan at the maximum — a faint line sits above the accent line by the pledge and joins it at month 60 with "Certificates back +9M"; the tooltip at month 1 lists Return, Certificates (green), Developer/Bank (red); the phone year card for year 1 shows a Bank group with Locked as guarantee 9,000,000; with the loan off, the chart and table are unchanged from before.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/capacity/BalanceChart.tsx src/app/components/capacity/YearTable.tsx
git commit -m "Real Estate: chart and year table show the pledge, the bank and the certificates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```

---

### Task 11: Document it and verify end to end

**Files:**
- Modify: `CLAUDE.md`
- Modify: `src/app/components/capacity/CapacityCalculator.tsx` (the page's limits note only)

- [ ] **Step 1: The page's limits note**

Replace the footnote `Estimates assume a constant return rate. Fund returns vary and are not guaranteed.` with:

```tsx
                  Estimates assume constant rates. Fund and certificate returns vary and are not guaranteed; bank fees,
                  early repayment and tax on certificate interest are not modelled.
```

- [ ] **Step 2: CLAUDE.md**

In `CLAUDE.md`:
- *Layout*: under `lib/capacity/`, add `purchase.ts  # the three ways of buying -> up-front + developer stream; horizon` and `loan.ts  # flat-rate loan terms, pledge held/released, declining equivalent`; under `app/lib/`, add `dealText.ts  # describeDeal / loanVerdict — the deal in sentences; tested`; under `components/capacity/`, add `PurchasePicker, LoanCard, Explain, DealSummary, LoanComparison`.
- *Real Estate — buying capacity*: change "The one feature so far" paragraph's first line to mention the three purchase kinds and the loan, and add a subsection **"Buying three ways, and the bank loan (2026-10-12)"** summarising: price meaning per kind (table from the spec), the pledge is locked and earns `rate/12` net, the buffer reads SPENDABLE only, the horizon is max(developer, loan) and `compare` uses the deal's horizon for both sides, flat-rate maths and the nominal declining equivalent, `withoutLoan` turns cash into the plan, inputs without `purchase`/`loan` are the original calculator so `REFERENCE` is untouched. Point at the spec path.
- *Running*: update the test count line ("65 tests in `src/lib/capacity`") to the number `npx vitest run src/lib/capacity` now reports.
- *Deliberately missing*: replace "The calculator models no borrowing" with "The calculator models a bank loan against certificates only (flat rate, no fees, no early repayment, no fixed approved cap); no property appreciation, no rent, constant rates".

- [ ] **Step 3: Full verification**

Run, in tmux (build can exceed 2 minutes):

```bash
mkdir -p ~/logs; tmux kill-session -t my-wallet-verify 2>/dev/null
tmux new -d -s my-wallet-verify "cd /home/mark/projects/my-wallet && npm test && npm run lint && npm run build 2>&1 | tee ~/logs/my-wallet-verify.log"
```

Then `tail -n 40 ~/logs/my-wallet-verify.log`.
Expected: all tests pass, lint clean, build succeeds. Paste the counts into the report, do not paraphrase.

Browser pass at 360×740 (phone) and 1280×800, signed in, `/real-estate`, against the spec's sections 1–7: the reference inputs still show 8,860,000; each kind; loan on/off; release toggle; the "examples" notice; errors focus their fields (including one inside closed bank terms); no horizontal scroll at 360px; reduced motion (DevTools emulation) shows no animation.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md src/app/components/capacity/CapacityCalculator.tsx
git commit -m "Docs: buying three ways and the bank loan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```
