# Bank loan, cash purchase and resale — buying capacity

_Approved in chat 2026-10-12. This file is the record; the implementation is the truth._

## Purpose

Today the Real Estate calculator answers one case: buy from a developer on
installments, paid out of a fund that keeps earning. Mark also wants to
weigh two other ways of buying, and a bank loan for either:

- **Developer, cash.** Pay the developer up front for a cash discount,
  funded (all or mostly) by a bank loan, then pay the bank instead of the
  developer.
- **Resale.** Buy from someone who has already paid the developer part of
  the price: pay the seller in cash (e.g. 10M, loan-funded), then carry
  the seller's remaining developer installments (e.g. 5M) on the
  developer's schedule.

The loan is the Egyptian **loan secured by a deposit**: savings sit in
certificates pledged to the bank, the bank lends against them, the
certificates keep paying interest monthly, and the pledge is locked until
it is released. The certificates may already exist or be bought for the
purpose — the maths is the same either way.

The question the page must answer is **"is the loan worth it?"** — so it
checks a specific deal, solves the maximum, and compares the deal with
the loan against the same purchase without it.

## Decisions (from the chat)

1. **Guarantee = loan against certificates** (choice A). The pledged
   money earns a configurable certificate rate, monthly, and cannot be
   spent.
2. **Output = check a deal + solve the maximum + loan vs no-loan
   comparison** (choice C).
3. **Flat rate.** Total interest = principal × flat rate × years, repaid in
   equal monthly installments. The equivalent declining-balance rate is
   shown beside it so offers compare like for like.
4. **Pledge release is a toggle:** all at the last installment, or
   gradually as the principal is repaid.
5. **Cash discount** applies to a developer cash purchase.
6. **Approach 1:** one generalised engine — every case is an up-front
   payment at month 0, an optional developer schedule after it, and an
   optional loan funding part of the up-front payment. No second engine.

Routine calls made without asking:

- **Loan amount is a % of the up-front payment**, so the solver can scale
  it with the price. A fixed bank-approved amount as a cap is a follow-up.
- **Lending ratio defaults to 100%** (borrow 100% of the pledge), editable.
- **Certificate interest is `rate / 12` of the pledge, each month** — how
  monthly-payout certificates quote — and is entered **net** (the fund's
  "fees on returns" does not apply to it).
- **Resale extra costs** (maintenance, finishing) are a share of the
  resale's total, cash to seller + remaining balance. Developer cash: a
  share of the CASH price paid. Developer plan: of the price, as today.
- **The safety buffer counts only the spendable fund.** Pledged money
  cannot cover an emergency.

## The model

### Inputs (added to `CalculatorInputs`)

```ts
type PurchaseKind = "developer-plan" | "developer-cash" | "resale";

interface PurchaseInput {
  kind: PurchaseKind;
  /** developer-cash: fraction off the installment price for paying in cash. */
  cashDiscount: number;
  /** resale: what is still owed to the developer — a fixed amount, not scaled. */
  resaleRemaining: number;
  /** resale: the remaining balance's plan (whole years 1–15, equal split). */
  resaleYears: number;
  resaleFrequency: PaymentFrequency;
}

interface LoanInput {
  enabled: boolean;
  /** Fraction of the up-front payment borrowed. */
  share: number;
  /** Flat annual rate, as a fraction. */
  flatRate: number;
  /** Whole years 1–15; repaid monthly. */
  years: number;
  /** Loan ÷ pledge — 1 means the bank lends 100% of the certificates. */
  lendingRatio: number;
  /** Annual certificate rate on the pledge, net, paid monthly. */
  certificateRate: number;
  release: "at-end" | "gradual";
}
```

`schedule` (down payment, plan years, frequency, custom shares) stays as it
is and keeps meaning the developer's installment plan. In developer-cash
mode it is still read: it is the **no-loan alternative** the comparison
uses, and its years set the horizon (below).

### What "price" means in each case

The engine still simulates `(inputs, price)` and the solver still
binary-searches `price`:

| kind | up-front at month 0 | developer payments after | extra costs × |
|---|---|---|---|
| developer-plan | `downPayment × price` | `buildInstallmentShares(schedule) × price` | price |
| developer-cash | `price × (1 − cashDiscount)` | none | cash price |
| resale | `price` (cash to the seller) | `resaleRemaining` split equally over `resaleYears` at `resaleFrequency` | price + resaleRemaining |

For developer-cash, `price` is the **installment price**, so its maximum is
directly comparable with the developer plan's.

### The loan

- `loan = share × upFront`; the loan pays that part of the up-front
  payment directly, the fund pays `upFront − loan`.
- `pledge = loan ÷ lendingRatio`, moved from the spendable fund into the
  pledge at month 0.
- `n = 12 × years`; monthly installment `loan × (1 + flatRate × years) / n`;
  total interest `loan × flatRate × years`.
- Principal repaid is `loan / n` a month (flat loans split principal
  equally), so after `k` installments the remaining principal is
  `loan × (1 − k/n)`.
- **Release:** `at-end` — the whole pledge returns to the fund at month
  `n`. `gradual` — each month the bank holds `remaining principal ÷
  lendingRatio`; the excess returns to the fund that month.
- **Equivalent declining rate:** the annual rate whose standard annuity
  over `n` months has the same monthly installment, found by bisection;
  shown as an effective annual rate (`rates.ts` conventions).

### Horizon

`horizonYears(inputs) = max(developer years, loan.enabled ? loan.years : 0)`
where developer years is `resaleYears` for a resale and `schedule.planYears`
otherwise (developer-cash included — that plan is its comparison). Past the
end of a payment stream, months carry only growth and income. The
comparison simulates both sides over the DEAL's horizon so the two final
balances are measured on the same date.

### Month order (extends today's)

Month 0: spendable = capital − (upFront − loan) − pledge; held = pledge.
Each month 1 … 12·horizon:

1. **growth** — fund return on a positive spendable balance, as today;
   **certificate interest** — `held × certificateRate / 12`, into spendable;
2. **income** — as today;
3. **payments** — developer installment, extra cost (at year end), bank
   installment (months 1…n);
4. **release** — per the toggle, from held to spendable.

The buffer and breach checks read spendable after step 4. The keep target
is checked on the final spendable balance (the pledge is fully released by
then, since the horizon covers the loan).

**Feasible** = month-0 fund payment + pledge fit inside the capital AND
spendable ≥ buffer every month AND final spendable ≥ keep target.

**Monotonic in price** still holds and a test asserts it per kind: every
month's balance is (piecewise) linear in price — the loan, the pledge and
the certificate interest all scale with it — so each month's buffer check
admits a half-line of prices and their intersection is a prefix.

### Validation (in `inputProblems`, new `InputField`s)

- `purchase.cashDiscount` 0 ≤ x < 1 · `purchase.resaleRemaining` ≥ 0 ·
  `purchase.resaleYears` whole 1–15 (resale only).
- `loan.share` 0–1 · `loan.flatRate` 0–1 · `loan.years` whole 1–15 ·
  `loan.lendingRatio` 0 < x ≤ 1 · `loan.certificateRate` 0–1 (loan only).
- `schedule.*` keeps its rules for developer-plan and developer-cash.

### Outputs

`SimulationResult` gains `loan: null | { amount, pledge, monthlyInstallment,
totalInterest, equivalentDecliningRate }`, `upFront`, `upFrontFromFund`,
`totalCertificateInterest`; `downPayment` keeps its meaning for the plan
(= `upFront` in the other kinds). `MonthPoint` gains `certificateInterest`,
`bankInstallment`, `released`, `held`. `YearSummary` gains `pledged` (year
1), `released`, `certificateInterest`, `bankInstallments`, and still
reconciles:

```
opening + returns + certificateInterest + income + released
  − downPayment(from fund) − pledged − installments − bankInstallments − extraCosts
  = closing
```

`paidIntoProperty` = up-front + developer payments + extra costs (the
loan's interest is reported separately, not hidden in the price).

New in `solve.ts`: `withoutLoan(inputs)` — loan off, and developer-cash
becomes developer-plan — and `compare(inputs, price?)` returning both sides'
`maxFeasiblePrice` and, when a price is given, both simulations, all over
the deal's horizon. `sensitivity` is unchanged.

## The screen

- **"How you buy"** `Segmented` at the top of the form: Developer plan ·
  Developer cash · Resale. Developer cash adds a cash-discount field (the
  plan fields stay, labelled as the installment alternative). Resale
  replaces the price wording with "Cash to the seller" and adds remaining
  balance, years and frequency.
- **"Bank loan"** `CheckRow` opens: borrow % of the up-front payment · flat
  rate (with "≈ X% declining" beneath) · years · lending ratio ·
  certificate rate · release (`Segmented`: At the end / Gradually).
- Persisted per device; `normalizeForm` defaults to Developer plan, loan
  off, so existing devices see today's page unchanged.
- **Results:** the hero is the deal's maximum as today. When the loan is on,
  a **comparison card** sits under it — With loan · Without loan — max
  price, lowest balance, ends with, total interest; the better max is not
  coloured (a position, not money moving). "Test a specific price" becomes
  "Check this deal" and runs both sides.
- **Chart:** the line stays the spendable fund; with a loan, a second
  solid muted line is spendable + held, so the locked money is visible but
  not mistaken for spendable. The buffer stays the ONE dashed line. A
  label marks the release (`Pledge released 6M`) via `placeLabels`.
- **Year table:** new rows under the existing story — *Pledged* /
  *Released*, *Certificate interest* (`gain`), *Bank installments*
  (`loss`) — zero rows hidden as today. Desktop gains the same columns
  when a loan is on.
- `LiveResult` / `DesktopResultBar` show the deal's maximum, unchanged.

## Testing

In `src/lib/capacity` (Vitest):

- The reference scenario (developer-plan, loan off) still solves to
  **8,860,000** with final balance 500,991.
- Flat-loan maths: installment, total interest, remaining principal; the
  equivalent declining rate round-trips through an annuity.
- Pledge locks at month 0, pays `rate/12` monthly, releases at the end or
  gradually (held tracks remaining principal ÷ ratio).
- A 0% loan for 100% of a developer-cash purchase (no discount), ratio 1,
  certificate rate = 12 × the fund's monthly rate, no fee: spendable + held
  follows, month by month, the balance of a developer plan with 0% down
  and monthly installments over the loan's years — a free loan is a 0%
  installment plan, nothing more.
- The buffer reads spendable only: a deal feasible on spendable + held but
  not on spendable alone is infeasible.
- Horizon = max of plan and loan; months past a stream carry only growth
  and income.
- Resale scales only the cash to the seller; `resaleRemaining` is fixed.
- Developer-cash applies the discount and its extra costs follow the cash
  price.
- Feasibility is monotonic in price for each kind, loan on and off.
- `YearSummary` reconciles every year with a loan on.
- `compare` measures both sides over the same horizon; `withoutLoan` turns
  developer-cash into developer-plan.

Form tests in `lib/capacityForm` for the new fields' parsing, defaults and
field mapping.

## Out of scope

Bank admin fees, early repayment, variable rates, a fixed loan cap,
certificate maturity dates, tax on certificate interest, property
appreciation, rent. The page's existing "what this does not model" note
gains the loan items.
