# Cash-Discount Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A developer purchase takes a tier table ("pay X% now → Y% off", the rest over the plan); the calculator solves every tier, marks the best, and the results follow the tier the user is viewing.

**Architecture:** The engine gains one number, `PurchaseInput.cashShare` (fraction of the discounted price paid now); a tier is a `{ cashShare, cashDiscount }` pair handed to the existing simulator. `solve.ts` gains `withTier`, `solveTiers` and `compareTiers`; `withoutLoan` stops turning a cash purchase into the developer plan. The form keeps the tiers as two parallel string arrays; the page derives an "active" input set for the tier being viewed and feeds it to the existing results.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-cash-discount-tiers-design.md` (extends `docs/superpowers/specs/2026-10-12-bank-loan-and-resale-design.md`). Read it before any task.

## Global Constraints

- Every rate and share in `src/lib/capacity` is a FRACTION; the UI multiplies by 100 at the edge only. `src/lib/capacity` stays pure.
- The reference scenario (`fixtures.ts`) must still solve to **8,860,000** with final balance 500,991 — never edit `REFERENCE`.
- `cashShare: 1` must reproduce today's cash purchase to the pound.
- The discount comes off the WHOLE price; "% now" is a share of the DISCOUNTED price; the rest is split EQUALLY over `schedule.planYears` at `schedule.frequency`; extra costs are a share of the discounted price; `price` is the developer's LIST price.
- Tiers: 1–6 rows; % now in (0, 100]; discount in [0, 100).
- The kind id stays `developer-cash`; its title is "From the developer, with cash discounts".
- "Best" is a tag, not a colour; `gain`/`loss` only for money moving in/out.
- Not one long page: new inputs live in a section, new results in a tab.
- Touch targets `min-h-[44px]`; inputs `text-[16px] md:text-sm`. Lint: no synchronous setState in an effect body.
- `.env` points at a LIVE database. Never run a server against it. The dev server runs in tmux `my-wallet-dev` against a local Postgres container (restart, if ever needed: `tmux new -d -s my-wallet-dev "cd /home/mark/projects/my-wallet && DATABASE_URL=postgres://postgres:local@127.0.0.1:55440/wallet npm run dev 2>&1 | tee ~/logs/my-wallet-dev.log"`); test login `sdd-check` / `local-check-2` (local only).
- Commands from `/home/mark/projects/my-wallet`: `npm test`, `npm run lint`, `npx tsc --noEmit -p .`.
- Commits end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ
  ```

## Review Focus

1. **A saved form from before tiers** (`purchaseKind: "developer-cash"`, `cashDiscountPct: "30"`, no tier arrays) — opens as one tier, 100% now / 30% off, same maximum as before (Task 2 test).
2. **Tier arrays of different lengths** in storage (hand-edited or half-saved) — padded/trimmed to one length, never a crash or an `undefined` row (Task 2 test).
3. **A tier the user is viewing is removed** — the page falls back to the best tier, never indexes past the end (Task 4: `tierIndex` clamp; checked in the browser step).
4. **Every tier unaffordable** — the "Which tier" card shows "Nothing" on every row and the hero shows the nothing-affordable card, no crash on `best: null` (Task 1 test for `best: null`; Task 4 browser check).
5. **A hidden down payment in cash mode** (e.g. "150" typed earlier in installments mode) — must not block the cash-tier result (Task 2 test).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/capacity/types.ts` (modify) | `PurchaseInput.cashShare`, `InputField` `"purchase.cashShare"`, `CashTier`, `TierResult`, `TierComparison` |
| `src/lib/capacity/purchase.ts` (modify) | `buildDeal` for a partial cash share; validation; default |
| `src/lib/capacity/solve.ts` (modify) | `withTier`, `solveTiers`, `compareTiers`; `withoutLoan` keeps the kind |
| `src/lib/capacity/index.ts` (modify) | exports |
| `src/app/lib/capacityForm.ts` (modify) | tier arrays, parse → `tiers`, migration, fields |
| `src/app/lib/capacitySections.ts` (modify) | tier fields → "buy"; summaries |
| `src/app/lib/dealText.ts` (modify) | `tierLabel`; partial-cash sentences |
| `src/app/components/capacity/PurchasePicker.tsx` (modify) | the tier editor replaces the single discount field |
| `src/app/components/capacity/ScheduleEditor.tsx` (modify) | `lengthOnly` mode (plan length + frequency) |
| `src/app/components/capacity/TierResults.tsx` (create) | the "Which tier" card |
| `src/app/components/capacity/CapacityCalculator.tsx` (modify) | tier wiring, active tier, labels |
| `src/app/components/capacity/LoanComparison.tsx` (modify) | column labels from props |
| `CLAUDE.md` (modify) | document the tiers |

---

### Task 1: Engine — the partial cash share and solving tiers

**Files:**
- Modify: `src/lib/capacity/types.ts`, `src/lib/capacity/purchase.ts`, `src/lib/capacity/solve.ts`, `src/lib/capacity/index.ts`
- Test: `src/lib/capacity/purchase.test.ts`, `src/lib/capacity/solve.test.ts`

**Interfaces:**
- Produces:
  - `PurchaseInput.cashShare: number`; `DEFAULT_PURCHASE.cashShare = 1`; `InputField` member `"purchase.cashShare"`.
  - `interface CashTier { cashShare: number; cashDiscount: number }`
  - `interface TierResult { tier: CashTier; capacity: CapacityResult }`
  - `interface TierComparison extends Comparison { withLoanTier: number | null; withoutLoanTier: number | null }`
  - `withTier(inputs: CalculatorInputs, tier: CashTier): CalculatorInputs`
  - `solveTiers(inputs: CalculatorInputs, tiers: CashTier[], step?: number, horizon?: number): { rows: TierResult[]; best: number | null }`
  - `compareTiers(inputs: CalculatorInputs, tiers: CashTier[], testPrice: number | null, selected: number, step?: number): TierComparison`
  - `withoutLoan` no longer changes `purchase.kind`.

- [ ] **Step 1: Types**

In `types.ts`, add to `PurchaseInput` after `cashDiscount`:

```ts
  /** developer-cash: fraction of the DISCOUNTED price paid at month 0 (1 = all of it); the rest goes over the plan. */
  cashShare: number;
```

Add `| "purchase.cashShare"` to `InputField`. After `Comparison`, add:

```ts
/** One row of a developer's cash-discount offer: pay this share now, get this much off. */
export interface CashTier {
  cashShare: number;
  cashDiscount: number;
}

export interface TierResult {
  tier: CashTier;
  capacity: CapacityResult;
}

/** A loan comparison across a tier table: each side is its own BEST tier. */
export interface TierComparison extends Comparison {
  withLoanTier: number | null;
  withoutLoanTier: number | null;
}
```

- [ ] **Step 2: Failing tests**

Append to `src/lib/capacity/purchase.test.ts` (reuse its `withInputs`, `sum`, `RESALE`):

```ts
describe("buildDeal — a partial cash share", () => {
  const cash = (cashShare: number, cashDiscount: number) =>
    withInputs({
      purchase: { ...RESALE, kind: "developer-cash", cashShare, cashDiscount },
      schedule: { downPayment: 0.1, planYears: 8, mode: "equal", frequency: "yearly" },
    });

  it("takes the discount off the whole price and the share of the discounted price now", () => {
    const d = buildDeal(cash(0.3, 0.1), 10_000_000, 8);
    expect(d.upFront).toBeCloseTo(2_700_000, 6);
    expect(sum(d.developerDue)).toBeCloseTo(6_300_000, 6);
    expect(d.developerDue[12]).toBeCloseTo(6_300_000 / 8, 6);
    expect(d.costBase).toBeCloseTo(9_000_000, 6);
  });

  it("spreads the rest at the plan's frequency, ignoring its down payment and custom shares", () => {
    const inputs = withInputs({
      purchase: { ...RESALE, kind: "developer-cash", cashShare: 0.5, cashDiscount: 0 },
      schedule: { downPayment: 0.9, planYears: 2, mode: "custom", yearShares: [0.05, 0.05], frequency: "quarterly" },
    });
    const d = buildDeal(inputs, 8_000_000, 2);
    expect(d.upFront).toBe(4_000_000);
    expect(d.developerDue[3]).toBeCloseTo(500_000, 6);
    expect(sum(d.developerDue)).toBeCloseTo(4_000_000, 6);
  });

  it("with everything paid now is exactly the old cash purchase", () => {
    const d = buildDeal(cash(1, 0.3), 10_000_000, 8);
    expect(d.upFront).toBeCloseTo(7_000_000, 6);
    expect(sum(d.developerDue)).toBe(0);
  });

  it("rejects a cash share of 0 or above 100%", () => {
    for (const cashShare of [0, -0.1, 1.01, Number.NaN]) {
      expect(purchaseProblems(cash(cashShare, 0)).map((p) => p.field)).toEqual(["purchase.cashShare"]);
    }
  });
});
```

Update the existing `RESALE` constant in `purchase.test.ts` (and in `simulate.test.ts`, `solve.test.ts`, `src/app/lib/dealText.test.ts` wherever a `PurchaseInput` literal is written) to include `cashShare: 1` — tsc requires it; values are unaffected.

Append to `src/lib/capacity/solve.test.ts` (add `compareTiers, solveTiers, withTier` to the `./solve` import, `CashTier` to the type import):

```ts
describe("cash-discount tiers", () => {
  const TIERS: CashTier[] = [
    { cashShare: 0.1, cashDiscount: 0 },
    { cashShare: 0.5, cashDiscount: 0.15 },
    { cashShare: 1, cashDiscount: 0.25 },
  ];
  const BASE = withInputs({
    purchase: { kind: "developer-cash", cashDiscount: 0, cashShare: 1, resaleRemaining: 0, resaleYears: 1, resaleFrequency: "yearly" },
  });

  it("withTier sets the pair and nothing else", () => {
    const t = withTier(BASE, TIERS[1]);
    expect(t.purchase).toMatchObject({ kind: "developer-cash", cashShare: 0.5, cashDiscount: 0.15 });
    expect(t.schedule).toBe(BASE.schedule);
  });

  it("solves every tier in input order and marks the highest maximum", () => {
    const { rows, best } = solveTiers(BASE, TIERS);
    expect(rows.map((r) => r.tier)).toEqual(TIERS);
    rows.forEach((r, i) => expect(r.capacity.maxPrice).toBe(maxFeasiblePrice(withTier(BASE, TIERS[i])).maxPrice));
    const maxima = rows.map((r) => r.capacity.maxPrice ?? -1);
    expect(best).toBe(maxima.indexOf(Math.max(...maxima)));
  });

  it("keeps the first of two equal tiers as best", () => {
    const { best } = solveTiers(BASE, [TIERS[2], TIERS[2]]);
    expect(best).toBe(0);
  });

  it("has no best when nothing is affordable", () => {
    const broke = withInputs({ ...BASE, startingCapital: 100, safetyBuffer: 1_000 });
    const { rows, best } = solveTiers(broke, TIERS);
    expect(rows.every((r) => r.capacity.maxPrice === null)).toBe(true);
    expect(best).toBeNull();
  });

  it("compares each side's own best tier over the deal's horizon, testing the selected tier", () => {
    const loan = { enabled: true, share: 1, flatRate: 0.12, years: 10, lendingRatio: 1, certificateRate: 0.11, release: "gradual" as const };
    const inputs = withInputs({ ...BASE, loan });
    const c = compareTiers(inputs, TIERS, 4_000_000, 1);
    const withSide = solveTiers(inputs, TIERS, undefined, 10);
    const withoutSide = solveTiers(withoutLoan(inputs), TIERS, undefined, 10);
    expect(c.horizonYears).toBe(10);
    expect(c.withLoanTier).toBe(withSide.best);
    expect(c.withoutLoanTier).toBe(withoutSide.best);
    expect(c.withLoan.maxPrice).toBe(withSide.rows[withSide.best!].capacity.maxPrice);
    expect(c.withoutLoan.maxPrice).toBe(withoutSide.rows[withoutSide.best!].capacity.maxPrice);
    expect(c.tested!.withLoan.upFront).toBeCloseTo(4_000_000 * 0.85 * 0.5, 4);
    expect(c.tested!.withLoan.monthly).toHaveLength(121);
  });
});
```

Change the existing test "turns the loan off, and a cash purchase back into the developer's plan" to:

```ts
  it("turns the loan off and keeps the purchase as it is — a tier table is its own alternative", () => {
    const base = withoutLoan(withInputs({ purchase: CASH, loan: LOAN }));
    expect(base.loan?.enabled ?? false).toBe(false);
    expect(base.purchase).toEqual(CASH);
  });
```

(and add `cashShare: 1` to that file's `CASH` literal).

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run src/lib/capacity`
Expected: FAIL — `withTier`/`solveTiers` not exported, partial share wrong.

- [ ] **Step 4: Implement**

`purchase.ts`: `DEFAULT_PURCHASE` gains `cashShare: 1`. Replace the `developer-cash` case of `buildDeal`:

```ts
    case "developer-cash": {
      // The discount is on the whole price; "% now" is a share of what is
      // left; the rest goes over the plan's years at its frequency, split
      // equally — the plan's own down payment and custom shares do not apply.
      const discounted = price * (1 - p.cashDiscount);
      if (p.cashShare < 1) {
        spread(
          buildInstallmentShares({
            downPayment: 0,
            planYears: inputs.schedule.planYears,
            mode: "equal",
            frequency: inputs.schedule.frequency,
          }),
          discounted * (1 - p.cashShare),
        );
      }
      return { upFront: discounted * p.cashShare, developerDue, costBase: discounted };
    }
```

In `purchaseProblems`, inside the developer-cash checks add:

```ts
  if (p.kind === "developer-cash" && (!Number.isFinite(p.cashShare) || p.cashShare <= 0 || p.cashShare > 1)) {
    problems.push({ field: "purchase.cashShare", message: "Paid now must be more than 0% and at most 100%." });
  }
```

Update the module's header comment line for developer-cash to: `developer-cash — price × (1 − discount) × cashShare now, the rest over the plan's years at its frequency. price stays the LIST price so tiers compare.`

`simulate.ts`'s `inputProblems` already runs `scheduleProblems` for developer-cash. Leave it — the page passes `downPayment: 0` and an equal schedule for this kind (Task 2), so the hidden fields cannot fail it.

`solve.ts` — replace `withoutLoan` and add, after `compare`:

```ts
export function withoutLoan(inputs: CalculatorInputs): CalculatorInputs {
  return { ...inputs, loan: inputs.loan ? { ...inputs.loan, enabled: false } : undefined };
}

/** The inputs with one tier's share and discount. */
export function withTier(inputs: CalculatorInputs, tier: CashTier): CalculatorInputs {
  return { ...inputs, purchase: { ...purchaseOf(inputs), cashShare: tier.cashShare, cashDiscount: tier.cashDiscount } };
}

/**
 * Every tier of a developer's cash-discount offer, solved over one horizon,
 * and which one carries the highest price (the first, on a tie). `best` is
 * null when no tier is affordable.
 */
export function solveTiers(
  inputs: CalculatorInputs,
  tiers: CashTier[],
  step = DEFAULT_STEP,
  horizon = horizonYears(inputs),
): { rows: TierResult[]; best: number | null } {
  const rows = tiers.map((tier) => ({ tier, capacity: maxFeasiblePrice(withTier(inputs, tier), step, horizon) }));
  let best: number | null = null;
  rows.forEach((r, i) => {
    if (r.capacity.maxPrice !== null && (best === null || r.capacity.maxPrice > rows[best].capacity.maxPrice!)) best = i;
  });
  return { rows, best };
}

/**
 * "Is the loan worth it?" across a tier table: each side takes its OWN best
 * tier — paying more now locks more savings as the bank's guarantee, so the
 * best tier can differ. The price being checked is tested on the SELECTED
 * tier, both sides, over the deal's horizon.
 */
export function compareTiers(
  inputs: CalculatorInputs,
  tiers: CashTier[],
  testPrice: number | null,
  selected: number,
  step = DEFAULT_STEP,
): TierComparison {
  const horizon = horizonYears(inputs);
  const base = withoutLoan(inputs);
  const withSide = solveTiers(inputs, tiers, step, horizon);
  const withoutSide = solveTiers(base, tiers, step, horizon);
  const none: CapacityResult = { maxPrice: null, simulation: null };
  const picked = tiers[selected] ?? tiers[0];
  return {
    horizonYears: horizon,
    withLoan: withSide.best === null ? none : withSide.rows[withSide.best].capacity,
    withoutLoan: withoutSide.best === null ? none : withoutSide.rows[withoutSide.best].capacity,
    withLoanTier: withSide.best,
    withoutLoanTier: withoutSide.best,
    tested:
      testPrice === null
        ? null
        : {
            withLoan: simulate(withTier(inputs, picked), testPrice, horizon),
            withoutLoan: simulate(withTier(base, picked), testPrice, horizon),
          },
  };
}
```

Fix `withoutLoan`'s doc comment: "The same purchase paid without the bank: the loan switched off. A cash-discount tier table is its own alternative — its low-% rows are the installment plan." Add `CashTier`, `CapacityResult`, `TierComparison`, `TierResult` to the type import.

`index.ts`: add `compareTiers, solveTiers, withTier` to the `./solve` export list.

- [ ] **Step 5: Run the suites**

Run: `npx vitest run src/lib/capacity` then `npm test`.
Expected: PASS; the 8,860,000 reference test still passes. `npx tsc --noEmit -p .` reports only `PurchaseInput` literals still missing `cashShare` in `src/app` — those are Task 2's; nothing in `src/lib`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/capacity src/app/lib/dealText.test.ts
git commit -m "Capacity: partial cash share and solving a cash-discount tier table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```

---

### Task 2: Form — the tier table, its fields, migration and summaries

**Files:**
- Modify: `src/app/lib/capacityForm.ts`, `src/app/lib/capacitySections.ts`
- Test: `src/app/lib/capacityForm.test.ts`, `src/app/lib/capacitySections.test.ts`

**Interfaces:**
- Consumes: `CashTier`, `withTier`, `purchaseProblems` (Task 1).
- Produces:
  - `CapacityForm`: `tierSharePcts: string[]`, `tierDiscountPcts: string[]`, `tiersEdited: boolean`; `cashDiscountPct` removed.
  - `FormField`: `` `tier-share-${number}` `` | `` `tier-discount-${number}` `` | `"tiers"`; `"cashDiscountPct"` removed.
  - `ParsedForm.tiers: CashTier[] | null` (non-null only for developer-cash with every row valid).
  - `MAX_TIERS = 6` exported from `capacityForm.ts`.
  - `sectionOf` maps tier fields and `"tiers"` to `"buy"`.

- [ ] **Step 1: Failing tests**

In `capacityForm.test.ts`, the reference-scenario `toEqual` gains `cashShare: 1` in `purchase`. Replace the test "reads a blank cash discount as 0 and a typed one as a fraction" with, and append:

```ts
describe("parseForm — cash-discount tiers", () => {
  const cash = (over: Partial<CapacityForm> = {}) =>
    form({ purchaseKind: "developer-cash", tierSharePcts: ["30", "100"], tierDiscountPcts: ["10", "25"], ...over });

  it("parses the table into fractions and puts the first tier on the inputs", () => {
    const { inputs, tiers, errors } = parseForm(cash());
    expect(errors).toEqual([]);
    expect(tiers).toEqual([
      { cashShare: 0.3, cashDiscount: 0.1 },
      { cashShare: 1, cashDiscount: 0.25 },
    ]);
    expect(inputs!.purchase).toMatchObject({ kind: "developer-cash", cashShare: 0.3, cashDiscount: 0.1 });
  });

  it("has no tiers for the other kinds", () => {
    expect(parseForm(form()).tiers).toBeNull();
  });

  it("reads a blank discount as 0 and requires the share", () => {
    const blankDiscount = parseForm(cash({ tierDiscountPcts: ["", "25"] }));
    expect(blankDiscount.tiers![0].cashDiscount).toBe(0);
    const blankShare = parseForm(cash({ tierSharePcts: ["", "100"] }));
    expect(blankShare.errors.map((e) => e.field)).toEqual(["tier-share-0"]);
  });

  it("puts each row's engine problem on that row's field", () => {
    const { errors } = parseForm(cash({ tierSharePcts: ["30", "120"], tierDiscountPcts: ["100", "25"] }));
    expect(errors.map((e) => e.field)).toEqual(["tier-discount-0", "tier-share-1"]);
  });

  it("needs one to six rows", () => {
    expect(parseForm(cash({ tierSharePcts: [], tierDiscountPcts: [] })).errors.map((e) => e.field)).toEqual(["tiers"]);
    const seven = Array.from({ length: 7 }, () => "100");
    expect(parseForm(cash({ tierSharePcts: seven, tierDiscountPcts: seven.map(() => "0") })).errors.map((e) => e.field)).toEqual([
      "tiers",
    ]);
  });

  it("ignores the hidden down payment and custom shares", () => {
    const { errors, inputs } = parseForm(cash({ downPaymentPct: "150", scheduleMode: "custom", yearPcts: ["5"] }));
    expect(errors).toEqual([]);
    expect(inputs!.schedule).toEqual({ downPayment: 0, planYears: 8, mode: "equal", frequency: "yearly" });
  });

  it("still requires the plan length the rest is paid over", () => {
    expect(parseForm(cash({ planYears: "" })).errors.map((e) => e.field)).toEqual(["planYears"]);
  });
});

describe("normalizeForm — tiers", () => {
  it("turns an old single cash discount into one tier, all now", () => {
    const old = { ...DEFAULT_FORM, purchaseKind: "developer-cash", cashDiscountPct: "30" } as Record<string, unknown>;
    delete old.tierSharePcts;
    delete old.tierDiscountPcts;
    const f = normalizeForm(old);
    expect(f.tierSharePcts).toEqual(["100"]);
    expect(f.tierDiscountPcts).toEqual(["30"]);
    expect(f.tiersEdited).toBe(true);
  });

  it("keeps the example tiers for a form that never had a cash discount", () => {
    const old = { ...DEFAULT_FORM } as Record<string, unknown>;
    delete old.tierSharePcts;
    delete old.tierDiscountPcts;
    expect(normalizeForm(old).tierSharePcts).toEqual(DEFAULT_FORM.tierSharePcts);
  });

  it("makes the two tier arrays the same length", () => {
    const f = normalizeForm({ ...DEFAULT_FORM, tierSharePcts: ["10", "50", "100"], tierDiscountPcts: ["0"] });
    expect(f.tierSharePcts).toEqual(["10", "50", "100"]);
    expect(f.tierDiscountPcts).toEqual(["0", "", ""]);
  });
});
```

In `capacitySections.test.ts`, replace the cash-discount `buy` expectation and the cash `payments` expectation:

```ts
    expect(sectionSummary("buy", form({ purchaseKind: "developer-cash" }))).toBe("Developer, cash discounts · 2 tiers");
```

```ts
    expect(sectionSummary("payments", form({ purchaseKind: "developer-cash" }))).toBe("Rest over 8 years · yearly");
```

and add to the `sectionOf` test: `expect(sectionOf("tier-share-2")).toBe("buy"); expect(sectionOf("tier-discount-0")).toBe("buy"); expect(sectionOf("tiers")).toBe("buy");`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/app/lib`
Expected: FAIL.

- [ ] **Step 3: Implement — `capacityForm.ts`**

Imports: add `purchaseProblems, withTier, type CashTier` from `@/lib/capacity`.

`CapacityForm`: remove `cashDiscountPct`; add

```ts
  /** developer-cash: each tier's "% paid now" and "% off", parallel arrays kept the same length. */
  tierSharePcts: string[];
  tierDiscountPcts: string[];
  /** False until a tier field is edited — until then the rows are labelled as examples. */
  tiersEdited: boolean;
```

`DEFAULT_FORM`: remove `cashDiscountPct`; add `tierSharePcts: ["10", "100"], tierDiscountPcts: ["0", "25"], tiersEdited: false,`.

Add `export const MAX_TIERS = 6;`.

`FormField`: remove `"cashDiscountPct"`; add `` | `tier-share-${number}` | `tier-discount-${number}` | "tiers" ``.

`FIELD_ORDER`: replace `"cashDiscountPct"` with `"tiers"`. In `fieldOrder`, before the `year-` line:

```ts
  const tier = /^tier-(share|discount)-(\d+)$/.exec(field);
  if (tier) return FIELD_ORDER.indexOf("tiers") - 0.5 + (Number(tier[2]) * 2 + (tier[1] === "discount" ? 1 : 0)) / 1e6;
```

`ENGINE_FIELDS`: map `"purchase.cashDiscount": "tier-discount-0"` and add `"purchase.cashShare": "tier-share-0"` (the inputs carry the first tier; rows 1+ are checked below).

In `parseForm`, replace the quiet-plan block's `quiet` with two flags and the schedule with:

```ts
  const kind = form.purchaseKind;
  // A resale has no plan on screen; a cash-tier purchase shows only the plan's
  // length and frequency. Hidden fields are read quietly so a stale value can
  // never block the result.
  const quietYears = kind === "resale";
  const quietPlan = kind !== "developer-plan";
  const planNumber = (field: FormField, raw: string, label: string, fallback: number, quiet: boolean) =>
    quiet ? (parseNumber(raw) ?? fallback) : required(field, raw, label);

  const planYears = planNumber("planYears", form.planYears, "Plan length", 1, quietYears);
  // The tier says what is paid now; the plan's own down payment does not apply.
  const downPayment = kind === "developer-cash" ? 0 : planNumber("downPaymentPct", form.downPaymentPct, "Down payment", 0, quietPlan) / 100;

  const schedule: CalculatorInputs["schedule"] =
    form.scheduleMode === "custom" && !quietPlan
      ? {
          downPayment,
          planYears,
          mode: "custom",
          yearShares: form.yearPcts.map((p, i) => optional(`year-${i}`, p, `Year ${i + 1} share`) / 100),
          frequency: form.frequency,
        }
      : { downPayment, planYears, mode: "equal", frequency: form.frequency };

  let tiers: CashTier[] | null = null;
  if (kind === "developer-cash") {
    const count = form.tierSharePcts.length;
    if (count < 1 || count > MAX_TIERS) {
      errors.push({ field: "tiers", message: `Enter between 1 and ${MAX_TIERS} tiers.` });
    } else {
      tiers = form.tierSharePcts.map((share, i) => ({
        cashShare: required(`tier-share-${i}`, share, `Tier ${i + 1} — paid now`) / 100,
        cashDiscount: optional(`tier-discount-${i}`, form.tierDiscountPcts[i] ?? "", `Tier ${i + 1} — discount`) / 100,
      }));
    }
  }
  const firstTier = tiers?.[0] ?? { cashShare: 1, cashDiscount: 0 };

  const purchase: PurchaseInput = {
    kind,
    cashDiscount: kind === "developer-cash" ? firstTier.cashDiscount : 0,
    cashShare: kind === "developer-cash" ? firstTier.cashShare : 1,
    resaleRemaining: kind === "resale" ? required("resaleRemaining", form.resaleRemaining, "What's still owed") : 0,
    resaleYears: kind === "resale" ? required("resaleYears", form.resaleYears, "Years left") : 1,
    resaleFrequency: form.resaleFrequency,
  };
```

(the old `quiet` / `planNumber` / `planYears` / `downPayment` / `schedule` / `purchase` declarations are replaced by these).

In the `if (errors.length === 0)` engine-check block, after the existing loop, add the rows after the first:

```ts
    // The inputs carry the first tier; check the rest the same way, each on its own row.
    tiers?.slice(1).forEach((tier, j) => {
      const i = j + 1;
      for (const problem of purchaseProblems(withTier(inputs, tier))) {
        const field: FormField = problem.field === "purchase.cashShare" ? `tier-share-${i}` : `tier-discount-${i}`;
        errors.push({ field, message: problem.message.replace(/^/, `Tier ${i + 1}: `) });
      }
    });
```

and prefix row 0's messages the same way: in the existing loop, when `problem.field` is `"purchase.cashShare"` or `"purchase.cashDiscount"`, push `` `Tier 1: ${problem.message}` ``.

`ParsedForm` gains `tiers: CashTier[] | null;` — the return becomes `{ inputs: errors.length === 0 ? inputs : null, tiers: errors.length === 0 ? tiers : null, errors, byField, testPrice }`.

`normalizeForm`: after the loop, before returning:

```ts
  // A saved single cash discount (before tiers) becomes one tier, all now.
  if (!Array.isArray(src.tierSharePcts) && typeof src.cashDiscountPct === "string" && src.purchaseKind === "developer-cash") {
    out.tierSharePcts = ["100"];
    out.tierDiscountPcts = [src.cashDiscountPct];
    out.tiersEdited = true;
  }
  // The two tier arrays are one table: the share column sets the length.
  const shares = out.tierSharePcts as string[];
  const discounts = out.tierDiscountPcts as string[];
  out.tierDiscountPcts = shares.map((_, i) => discounts[i] ?? "");
```

- [ ] **Step 4: Implement — `capacitySections.ts`**

In `sectionOf`, before the `year-` line: `if (field === "tiers" || field.startsWith("tier-")) return "buy";`. Remove `cashDiscountPct` from `FIELD_SECTION`.

`buy` summary: replace the developer-cash branch with `` `Developer, cash discounts · ${form.tierSharePcts.length === 1 ? "1 tier" : `${form.tierSharePcts.length} tiers`}` ``.

`payments` summary: replace the developer-cash branch with `` `Rest over ${years(form.planYears)} · ${form.frequency}` ``.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/app/lib` then `npm test`.
Expected: PASS. `npx tsc --noEmit -p .` may still flag `PurchasePicker.tsx` (uses `cashDiscountPct`) — Task 4 replaces it; nothing else.

- [ ] **Step 6: Commit**

```bash
git add src/app/lib
git commit -m "Capacity form: a cash-discount tier table, migrated from the single discount

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```

---

### Task 3: Words — `tierLabel` and the partial-cash sentences

**Files:**
- Modify: `src/app/lib/dealText.ts`
- Test: `src/app/lib/dealText.test.ts`

**Interfaces:**
- Consumes: `CashTier`, `PurchaseInput.cashShare`.
- Produces: `tierLabel(tier: CashTier): string`.

- [ ] **Step 1: Failing tests**

Append to `dealText.test.ts` (import `tierLabel`; reuse `text`/`amounts`, `REFERENCE`, `simulate`):

```ts
describe("tierLabel", () => {
  it("names a tier the way the page shows it", () => {
    expect(tierLabel({ cashShare: 0.3, cashDiscount: 0.1 })).toBe("30% now (10% off)");
    expect(tierLabel({ cashShare: 1, cashDiscount: 0.25 })).toBe("All now (25% off)");
    expect(tierLabel({ cashShare: 0.1, cashDiscount: 0 })).toBe("10% now (no discount)");
    expect(tierLabel({ cashShare: 0.125, cashDiscount: 0.075 })).toBe("12.5% now (7.5% off)");
  });
});

describe("describeDeal — a partial cash tier", () => {
  const tier: CalculatorInputs = {
    ...REFERENCE,
    maintenance: { share: 0, year: 1 },
    purchase: { kind: "developer-cash", cashShare: 0.3, cashDiscount: 0.1, resaleRemaining: 0, resaleYears: 1, resaleFrequency: "yearly" },
  };
  const s = describeDeal(tier, simulate(tier, 10_000_000));

  it("says how much of the discounted price is paid now", () => {
    expect(text(s[0])).toBe("You pay the developer # today (30% of the price after 10% off), from savings.");
    expect(amounts(s[0])).toEqual([{ amount: 2_700_000, tone: "out" }]);
  });

  it("says the rest goes to the developer over the plan", () => {
    expect(text(s[1])).toBe("Then you pay the developer # at the end of each year for 8 years.");
    expect(amounts(s[1])).toEqual([{ amount: 787_500, tone: "out" }]);
  });
});
```

(`6,300,000 / 8 = 787,500`.) Add `cashShare: 1` to every `PurchaseInput` literal already in this file if Task 1 did not.

- [ ] **Step 2: Run to see them fail** — `npx vitest run src/app/lib/dealText.test.ts` → FAIL.

- [ ] **Step 3: Implement**

In `dealText.ts`, add:

```ts
const pctText = (f: number) => `${Number((f * 100).toFixed(2))}%`;

/** A tier as the page names it: "30% now (10% off)", "All now (25% off)". */
export function tierLabel(tier: CashTier): string {
  const now = tier.cashShare >= 1 ? "All now" : `${pctText(tier.cashShare)} now`;
  return `${now} (${tier.cashDiscount > 0 ? `${pctText(tier.cashDiscount)} off` : "no discount"})`;
}
```

In `describeDeal`, replace the `what` expression with:

```ts
  const what =
    purchase.kind === "developer-plan"
      ? " as the down payment"
      : purchase.kind === "developer-cash"
        ? purchase.cashShare >= 1
          ? " (the cash price)"
          : purchase.cashDiscount > 0
            ? ` (${pctText(purchase.cashShare)} of the price after ${pctText(purchase.cashDiscount)} off)`
            : ` (${pctText(purchase.cashShare)} of the price)`
        : "";
```

In `developerClause`, replace the first guard with:

```ts
  if ((purchase.kind === "developer-cash" && purchase.cashShare >= 1) || sim.totalInstallments <= 0) return null;
```

and make the custom-schedule branch apply only to `developer-plan` (it already checks `purchase.kind === "developer-plan"` — keep it). For developer-cash the frequency and years come from `inputs.schedule`, which the existing lines already read.

Import `type CashTier` from `@/lib/capacity`.

- [ ] **Step 4: Run** — `npx vitest run src/app/lib` → PASS; `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/lib/dealText.ts src/app/lib/dealText.test.ts
git commit -m "Capacity: name a tier, and read a partial-cash deal back in words

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```

---

### Task 4: The screen — tier editor, plan length, "Which tier", wiring

**Files:**
- Modify: `src/app/components/capacity/PurchasePicker.tsx`, `ScheduleEditor.tsx`, `CapacityCalculator.tsx`, `LoanComparison.tsx`, `formErrors.tsx`, `src/app/components/ui.tsx` (`hideLabel`)
- Create: `src/app/components/capacity/TierResults.tsx`

**Interfaces:**
- Consumes: `solveTiers`, `compareTiers`, `withTier`, `TierResult`, `TierComparison` (Task 1); `ParsedForm.tiers`, `MAX_TIERS`, tier fields (Task 2); `tierLabel` (Task 3).
- Produces: `default function TierResults({ rows, best, selected, onSelect, currency }: { rows: TierResult[]; best: number | null; selected: number; onSelect: (i: number) => void; currency: string })`; `ScheduleEditor` prop `lengthOnly?: boolean`; `LoanComparison` props `withLabel?: string; withoutLabel?: string`.

- [ ] **Step 1: The tier editor (PurchasePicker.tsx)**

Change the cash choice to `{ kind: "developer-cash", title: "From the developer, with cash discounts", line: "Pay more up front, get a bigger discount." }`. Replace `CashFields` with:

```tsx
/**
 * The developer's cash-discount offer as a small table — each row "pay X%
 * now → Y% off". Rows keep the order typed; the results say which is best.
 * One error line per row, beneath the pair, like CostRow.
 */
function TierFields({ form, update }: { form: CapacityForm; update: (patch: Partial<CapacityForm>) => void }) {
  const { errorFor } = useFormErrors();
  const setCell = (column: "tierSharePcts" | "tierDiscountPcts", i: number, value: string) => {
    const next = [...form[column]];
    next[i] = value;
    update({ [column]: next, tiersEdited: true });
  };
  const add = () =>
    update({ tierSharePcts: [...form.tierSharePcts, ""], tierDiscountPcts: [...form.tierDiscountPcts, ""], tiersEdited: true });
  const remove = (i: number) =>
    update({
      tierSharePcts: form.tierSharePcts.filter((_, j) => j !== i),
      tierDiscountPcts: form.tierDiscountPcts.filter((_, j) => j !== i),
      tiersEdited: true,
    });
  const setError = errorFor("tiers");

  return (
    <div className="space-y-3">
      {!form.tiersEdited && (
        <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
          <span className="font-semibold text-white">Example tiers</span> — enter your developer&apos;s offer.
        </p>
      )}
      {form.tierSharePcts.map((share, i) => {
        const errorId = `${fieldId(`tier-share-${i}`)}-row-error`;
        const error = errorFor(`tier-share-${i}`) ?? errorFor(`tier-discount-${i}`);
        return (
          <div key={i}>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-end gap-2">
              <CalcField
                field={`tier-share-${i}`}
                label="Paid now"
                hideLabel={i > 0}
                ariaLabel={`Tier ${i + 1}, paid now`}
                errorId={errorId}
                value={share}
                onChange={(v) => setCell("tierSharePcts", i, v)}
                suffix="% now"
                placeholder="30"
              />
              <CalcField
                field={`tier-discount-${i}`}
                label="Discount"
                hideLabel={i > 0}
                ariaLabel={`Tier ${i + 1}, discount`}
                errorId={errorId}
                value={form.tierDiscountPcts[i] ?? ""}
                onChange={(v) => setCell("tierDiscountPcts", i, v)}
                suffix="% off"
                placeholder="0"
              />
              {form.tierSharePcts.length > 1 ? (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove tier ${i + 1}`}
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
                    <path d="m4 4 8 8m0-8-8 8" />
                  </svg>
                </button>
              ) : (
                <span />
              )}
            </div>
            {error && <FieldError id={errorId}>{error}</FieldError>}
          </div>
        );
      })}
      {setError && <FieldError>{setError}</FieldError>}
      {form.tierSharePcts.length < MAX_TIERS && (
        <button
          type="button"
          onClick={add}
          className="min-h-[44px] cursor-pointer rounded-lg px-1 text-xs font-medium text-accent transition-colors hover:text-accent/80"
        >
          + Add tier
        </button>
      )}
      <p className="text-[11px] leading-snug text-white/40">
        The discount is off the whole price; &quot;% now&quot; is a share of the discounted price, and the rest goes over the
        plan (Payments). The results show which tier lets you afford the most.
      </p>
    </div>
  );
}
```

Render `<TierFields form={form} update={update} />` where `CashFields` was. Imports: `useFormErrors`, `fieldId` from `./formErrors`; `FieldError` from `../ui`; `MAX_TIERS` from `@/app/lib/capacityForm`. Remove the now-unused `parseNumber` import if nothing else uses it (`ResaleFields` does — keep it).

Add an optional `hideLabel?: boolean` prop to `Field` (`src/app/components/ui.tsx`) that gives its visible label text the `sr-only` class, and pass it through `CalcField` (`formErrors.tsx`). Rows after the first hide their labels so the table reads as one header row; screen readers still get the label.

- [ ] **Step 2: Plan length only (ScheduleEditor.tsx)**

Add a prop `lengthOnly?: boolean`. When true, render the plan-length `CalcField` full width (no down-payment field beside it), no "Remaining balance" mode switch and no custom-year list, then the frequency block with the label "The rest is paid" instead of "Paid". Everything else unchanged.

- [ ] **Step 3: The "Which tier" card (TierResults.tsx)**

```tsx
"use client";

import type { TierResult } from "@/lib/capacity";
import { tierLabel } from "@/app/lib/dealText";
import { formatMoney } from "@/app/lib/format";
import { Card } from "../ui";

/**
 * Every tier of the developer's offer, solved: what each lets you afford and
 * the cash it asks for now. The best carries a tag (a position, not money
 * moving, so no green); tapping a row makes the rest of the results show it.
 */
export default function TierResults({
  rows,
  best,
  selected,
  onSelect,
  currency,
}: {
  rows: TierResult[];
  best: number | null;
  selected: number;
  onSelect: (i: number) => void;
  currency: string;
}) {
  const figure = (n: number) => formatMoney(n, "");
  return (
    <Card title="Which tier" className="animate-rise" style={{ animationDelay: "40ms" }}>
      <p className="-mt-2 mb-3 text-[11px] text-white/40">
        Max you can afford at each tier of the developer&apos;s offer, in {currency}. Tap one to see its plan.
      </p>
      <div role="radiogroup" aria-label="Which tier the results show" className="space-y-1.5">
        {rows.map((r, i) => {
          const on = i === selected;
          const max = r.capacity.maxPrice;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSelect(i)}
              className={`pressable flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                on ? "border-accent/60 bg-accent/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-white">
                  {tierLabel(r.tier)}
                  {i === best && <span className="ml-2 rounded bg-white/10 px-1.5 py-px text-[10px] font-medium text-white/80">Best</span>}
                </span>
                {r.capacity.simulation && (
                  <span className="block text-[11px] text-white/40">{figure(r.capacity.simulation.upFront)} now</span>
                )}
              </span>
              <span className="shrink-0 font-mono text-sm tabular-nums text-white">
                {max === null ? <span className="text-white/40">Nothing</span> : figure(max)}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: LoanComparison column labels**

Add optional props `withLabel?: string; withoutLabel?: string`. The header cells read `withLabel ?? "With loan"` and `withoutLabel ?? "Without loan"`; delete the `otherLabel` line that special-cased `developer-cash` as "Installments".

- [ ] **Step 5: Wire the page (CapacityCalculator.tsx)**

1. Imports: `compareTiers`, `solveTiers`, `withTier`, `type TierComparison` from `@/lib/capacity`; `TierResults`; `tierLabel` from `@/app/lib/dealText`.
2. Keep the last valid tiers with the last valid inputs — replace the `lastInputs` lines with:

```tsx
  const { tiers } = parsed;
  const [last, setLast] = useState({ inputs, tiers });
  if (inputs !== null && (inputs !== last.inputs || tiers !== last.tiers)) setLast({ inputs, tiers });
  const shown = inputs ?? last.inputs;
  const shownTiers = inputs ? tiers : last.tiers;
  const stale = inputs === null;
```

3. The tier being viewed — after `stale`:

```tsx
  const tierTable = useMemo(() => (shown && shownTiers ? solveTiers(shown, shownTiers) : null), [shown, shownTiers]);
  // The tier the user tapped; null = the best. A changed table (not any other
  // keystroke) resets it — compared by value, adjusted during render.
  const [pickedTier, setPickedTier] = useState<number | null>(null);
  const tiersKey = shownTiers ? JSON.stringify(shownTiers) : "";
  const [seenTiersKey, setSeenTiersKey] = useState(tiersKey);
  if (tiersKey !== seenTiersKey) {
    setSeenTiersKey(tiersKey);
    setPickedTier(null);
  }
  const tierIndex =
    tierTable && pickedTier !== null && pickedTier < tierTable.rows.length ? pickedTier : (tierTable?.best ?? 0);
  // What every result below describes: the inputs, or the inputs at the tier being viewed.
  const active = useMemo(
    () => (shown && shownTiers ? withTier(shown, shownTiers[tierIndex]) : shown),
    [shown, shownTiers, tierIndex],
  );
```

4. Replace the `comparison`, `capacity`, `rows`, `tested`, `kind` memos with:

```tsx
  const loanOn = active?.loan?.enabled === true;
  const comparison: Comparison | TierComparison | null = useMemo(() => {
    if (!active || !loanOn) return null;
    return shown && shownTiers ? compareTiers(shown, shownTiers, testPrice, tierIndex) : compare(active, testPrice);
  }, [active, loanOn, shown, shownTiers, testPrice, tierIndex]);
  const capacity = useMemo(() => {
    if (tierTable) return tierTable.rows[tierIndex].capacity;
    if (comparison) return comparison.withLoan;
    return active ? maxFeasiblePrice(active) : null;
  }, [tierTable, tierIndex, comparison, active]);
  const rows = useMemo(() => (active ? sensitivity(active) : null), [active]);
  const tested = useMemo(
    () =>
      comparison ? (comparison.tested?.withLoan ?? null) : active && testPrice !== null ? simulate(active, testPrice) : null,
    [comparison, active, testPrice],
  );
  const kind: PurchaseKind = active ? purchaseOf(active).kind : "developer-plan";
```

5. Every place below that passes `shown` to a result component or reads it for a result (Hero's `capital`/`buffer`, `LoanComparison inputs`, `DealSummary inputs`, `BalanceChart inputs`, `YearTable`, the nothing-affordable copy, the Verdicts' `capital`/`buffer`) passes `active` instead — they describe the tier being viewed. `shown` stays only for `stale`/`aria-busy` checks and `ErrorSummary`'s `hasResult`. `LoanComparison` with tiers gets `inputs={withTier(shown, shownTiers[c.withLoanTier ?? 0])}` and the labels:

```tsx
withLabel={tierTable && "withLoanTier" in comparison && comparison.withLoanTier !== null ? `With loan · ${tierLabel(shownTiers![comparison.withLoanTier])}` : undefined}
withoutLabel={tierTable && "withoutLoanTier" in comparison && comparison.withoutLoanTier !== null ? `Without loan · ${tierLabel(shownTiers![comparison.withoutLoanTier])}` : undefined}
```

6. In the Answer panel, right after the Hero / nothing-affordable branch and before `LoanComparison`, add:

```tsx
                    {tierTable && (
                      <TierResults
                        rows={tierTable.rows}
                        best={tierTable.best}
                        selected={tierIndex}
                        onSelect={setPickedTier}
                        currency={currency}
                      />
                    )}
```

When every tier is unaffordable the existing nothing-affordable card shows (capacity.maxPrice is null) and the tier card still lists every row as "Nothing".

7. Hero: add a `tierName?: string` prop, shown under the "Maximum buying capacity" label as `<span className="text-white/40"> · {tierName}</span>`; pass `tierName={tierTable ? tierLabel(shownTiers![tierIndex]) : undefined}`. The developer-cash sentence becomes: `` `The highest list price this deal carries — you pay ${money(sim.upFront)} now — without the fund dropping below ${money(buffer)}.` ``
8. The test-price label for developer-cash: `"List price"`; the second Verdict's label: always `"Without the loan"`.
9. Payments section: replace the whole `id === "payments"` expression with

```tsx
                {id === "payments" &&
                  (form.purchaseKind === "resale" ? (
                    <ResaleFields form={form} update={update} currency={currency} />
                  ) : (
                    <ScheduleEditor form={form} update={update} lengthOnly={form.purchaseKind === "developer-cash"} />
                  ))}
```

and delete `planOpen` / `setPlanOpen`, `PlanSummaryLine` and the now-unused `PLAN_FIELDS` import.

- [ ] **Step 6: Check**

Run: `npx tsc --noEmit -p .`, `npm run lint`, `npm test` — all clean.

Browser (dev server in tmux `my-wallet-dev`, local DB only; login `sdd-check` / `local-check-2`; playwright-core script in `/tmp/claude-1000/-home-mark-projects-my-wallet/1b98aea7-0c9d-4e05-84f0-920a11ae9f8d/scratchpad`), at 390×844 and 1280×800:
- Developer, cash discounts with the example tiers: the "Example tiers" notice; editing a cell hides it; Add tier up to 6, then hidden; remove hidden at 1 row.
- Payments shows only plan length + "The rest is paid"; its summary reads "Rest over 8 years · yearly".
- Answer tab: "Which tier" lists each tier with its max and cash now, one "Best" tag; the hero names the tier ("· 30% now (10% off)"); tapping another row changes the hero, "Your deal", Over time and Year by year; removing the selected tier falls back to the best; editing capital keeps the selection.
- Capital 100 with buffer 1,000: every row "Nothing", the nothing-affordable card, no console error.
- With the loan on: the comparison header names both tiers.
- A reference developer-plan setup still shows 8,860,000.

Write down what you saw, with the numbers.

- [ ] **Step 7: Commit**

```bash
git add src/app/components
git commit -m "Real Estate: the developer's cash-discount tiers, solved and compared

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```

---

### Task 5: Document it

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

In *Real Estate — buying capacity* → *Buying three ways, and the bank loan*: change the developer-cash row of the price table to "`price × (1 − cashDiscount) × cashShare` now · the rest equal over `planYears` at `frequency` · discounted price", and add a subsection **"Cash-discount tiers (2026-10-12)"**: the tier table (1–6 rows, `% now` of the discounted price, discount off the whole price), `withTier` / `solveTiers` (best = highest max, first on a tie, null when none) / `compareTiers` (each side its own best; test on the selected tier), `withoutLoan` no longer turns cash into the plan, the form's parallel arrays + migration from `cashDiscountPct`, the page's "Which tier" card and the active-tier rule (every result follows the tier being viewed; a changed table resets to the best). Point at the spec. Update the `lib/capacity` test count to what `npx vitest run src/lib/capacity` reports. In *Layout*, add `TierResults` to `components/capacity/`.

- [ ] **Step 2: Verify**

Run `npm test`, `npm run lint`, and — after stopping the dev server (`tmux kill-session -t my-wallet-dev`) — `npm run build` in tmux (`tmux new -d -s my-wallet-verify "cd /home/mark/projects/my-wallet && npm run build 2>&1 | tee ~/logs/my-wallet-verify.log"`; read the log tail), then restart the dev server with the local-DB override from Global Constraints. Report the counts.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Docs: cash-discount tiers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FdyRQ5zAbUGgG6encTvJiQ"
```
