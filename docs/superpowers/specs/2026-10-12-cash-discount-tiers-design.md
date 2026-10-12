# Cash-discount tiers — buying capacity

> **Superseded 2026-10-13** by `2026-10-13-calculator-redesign-design.md` — a cash tier is now just a plan. Never built.

_Approved in chat 2026-10-12. Extends `2026-10-12-bank-loan-and-resale-design.md`.
This file is the record; the implementation is the truth._

## Purpose

A developer's cash discount is not one number: the more of the price is paid
up front, the bigger the discount ("30% now → 10% off, 50% now → 20% off,
100% now → 30% off"), and whatever is not paid now goes over the plan. Mark
wants to enter the developer's tier table and have the calculator say which
tier lets him afford the most.

## Decisions (from the chat)

1. **A tier table** (choice A): rows of "pay at least X% now → Y% off"; the
   rest of the price goes over the developer's plan. No per-tier plan length.
2. **The calculator picks** (choice A): it solves every tier, shows them side
   by side, marks the best, and the rest of the results follow the best tier
   until the user taps another row.

Routine calls made without asking:

- The discount comes off the WHOLE price; "% now" is a share of the
  DISCOUNTED price. 30% now / 10% off on 10,000,000 → 9,000,000 price,
  2,700,000 now, 6,300,000 over the plan.
- The rest is split EQUALLY over the plan's years at the plan's frequency
  (`schedule.planYears`, `schedule.frequency`). Custom year shares and the
  down-payment field do not apply to this kind.
- `price` stays the developer's LIST price, so the tiers' maxima compare.
- Extra costs are a share of the discounted price (as the cash purchase was).
- Up to 6 tiers; % now in (0, 100]; discount in [0, 100).
- The kind keeps its id `developer-cash` (saved forms), retitled "From the
  developer, with cash discounts".

## The model

### Engine (`src/lib/capacity`)

`PurchaseInput` gains `cashShare: number` — the fraction of the discounted
price paid at month 0 (1 = everything). `cashDiscount` keeps its meaning.
For `kind: "developer-cash"`, `buildDeal` becomes:

```
discounted = price × (1 − cashDiscount)
upFront    = discounted × cashShare
developer stream = discounted × (1 − cashShare), split equally over
                   schedule.planYears at schedule.frequency
costBase   = discounted
```

`cashShare: 1` reproduces today's cash purchase exactly. A tier is a
`{ cashShare, cashDiscount }` pair; the engine simulates one at a time —
tiers are a solve-level concept, not a simulate-level one.

`DEFAULT_PURCHASE.cashShare = 1`; `purchaseProblems` adds `cashShare` in
(0, 1] for `developer-cash` (`InputField` `"purchase.cashShare"`).

### Solving tiers (`solve.ts`)

```ts
interface CashTier { cashShare: number; cashDiscount: number }
interface TierResult { tier: CashTier; capacity: CapacityResult }
withTier(inputs, tier): CalculatorInputs          // purchase with that pair
solveTiers(inputs, tiers, step?, horizon?): { rows: TierResult[]; best: number | null }
```

`best` is the index of the highest `maxPrice` (first wins a tie); null when
no tier is affordable. All tiers are solved over one horizon
(`horizonYears(inputs)`).

**With a loan**, the comparison is best-with-loan vs best-without-loan:
`compareTiers(inputs, tiers, testPrice?, selected?)` solves `solveTiers` on
the deal and on `withoutLoan(inputs)`, both over the deal's horizon, and
returns `{ horizonYears, withLoan: TierResult & {index}, withoutLoan: … ,
tested }` — the two best tiers may differ (paying more now locks more
savings as the guarantee). `withoutLoan` NO LONGER turns developer-cash into
the developer plan: the tier table is its own alternative (a low-% / 0%-off
row is the installment plan).

### Validation

`tiers` (1–6 rows) is validated in the form layer (it is not an engine
input); each row's share and discount by the engine's `purchaseProblems`
through `withTier`, mapped back to the row's fields.

## The screen

- **How you buy** — the cash card reads "From the developer, with cash
  discounts · Pay more up front, get a bigger discount." Under it, the tier
  table: rows of *Paid now [ ]% · Discount [ ]% · remove*, "Add tier" (hidden
  at 6, remove hidden at 1). Rows are shown in the order typed. Defaults: two
  example rows, 10% → 0% and 100% → 25%, under "Example tiers — enter your
  developer's offer." until a tier field is edited (`tiersEdited`).
- **Payments** — for this kind only plan length and frequency ("The rest is
  paid over"); no down payment, no custom shares. The closed summary reads
  "Rest over 8 years · yearly".
- **Answer tab** — under the hero, a **"Which tier"** card: one row per tier,
  *Paid now · Discount · Max you can afford · Cash now* (the tier's up-front
  payment at its maximum), the best with a small "Best" tag (a tag, not
  colour — a position). Rows are buttons (44px); the selected one has the
  accent border. Selecting a row makes the hero, "Your deal", the chart, the
  year table, Check this deal and the return-rate table show that tier;
  default and reset is the best tier. The hero labels it: "With 30% now
  (10% off)". An unaffordable tier shows "Nothing".
- With the loan on, the verdict/comparison card compares the two BEST tiers
  and names them in its column headers: "With loan · 30% now (10% off)",
  "Without loan · All now (25% off)".
- The phone strip shows the best tier's maximum.
- `describeDeal` for this kind: "You pay the developer # today (30% of the
  price after 10% off), from savings." (with a loan: "… — # from the bank, #
  from savings.") and the developer clause for the rest
  ("the developer # at the end of each year for 8 years").
  A 100% tier keeps today's sentence ("today (the cash price), from
  savings."), so a single-row table reads exactly as the cash purchase did.

## Form (`capacityForm.ts`)

`tierSharePcts: string[]`, `tierDiscountPcts: string[]` (parallel, same
length — string arrays survive `normalizeForm` as is), `tiersEdited:
boolean`. `parseForm` returns `tiers: CashTier[] | null` beside `inputs`;
`inputs.purchase` for this kind carries the FIRST tier (any valid pair — the
page solves the table through `solveTiers`). Fields: `tier-share-N`,
`tier-discount-N`, `tiers` (set-level: count). All map to the "buy" section.
**Migration:** a saved form with the old `cashDiscountPct` and no tier
arrays becomes one tier, 100% now / that discount (blank → 0).
`cashDiscountPct` leaves `CapacityForm`.

## Testing

- `buildDeal`: 30% now / 10% off / 10M → up-front 2.7M, stream 6.3M over
  the plan at its frequency, cost base 9M; `cashShare: 1` equals the old
  cash purchase to the pound; the reference 8,860,000 is unchanged.
- `solveTiers`: rows in input order, best = highest max, tie → first, all
  null → best null; feasibility monotonic per tier.
- `compareTiers`: each side picks its own best; both over the deal's horizon.
- Form: parallel arrays parse to tiers; bad row → its own field; count 0 or
  7 → `tiers` error; migration from `cashDiscountPct`; `normalizeForm` pads
  mismatched array lengths.
- `describeDeal` sentence for a partial-cash tier.

## Out of scope

Per-tier plan lengths, discounts that depend on the plan length, interpolating
between tiers, a different discount base (list price vs discounted).
