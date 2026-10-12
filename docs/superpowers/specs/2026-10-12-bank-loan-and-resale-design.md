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
  shown as a NOMINAL annual rate (monthly rate × 12) — how banks quote a
  declining-balance loan, so it compares directly with another offer.

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

Two pure helpers turn results into words for the screen, in
`src/app/lib/` beside `capacityForm.ts` (they format, so they are UI-side,
but take no React): `describeDeal(inputs, sim)` → the "Your deal"
sentences as `{ text, amount?, tone: "in" | "out" | "held" }` parts, and
`loanVerdict(comparison)` → `{ kind: "loan-better" | "no-loan-better" |
"same", difference, interest, certificateInterest, discountSaved }`.
`SimulationResult.loan` also carries `netCost` = total interest −
certificate interest earned on the pledge.

## The screen — made easy on purpose

The maths is the hard part; the page must not be. Mark asked for this to be
"super user friendly", so the screen is designed around five rules (from
the ui-ux-pro-max pass, 2026-10-12: `progressive-disclosure`,
`input-helper-text`, `redundant-entry`, `data-density`,
`screen-reader-summary`) and one test: **someone who has never heard the
word "pledge" can enter a bank's offer and read the answer correctly.**

### 1. Ask how they buy, in words, before any number

The form opens with **"How are you buying?"**: three tappable choice cards
(radio group, `pressable surface`, ≥ 44px, the selected one `accent`
bordered), each a title and one plain line:

- **From the developer, in installments** — "Down payment now, the rest
  over the developer's plan." *(today's calculator, the default)*
- **From the developer, in cash** — "Pay the cash price up front, usually
  at a discount."
- **Resale** — "Pay a seller in cash and take over what they still owe the
  developer."

On a phone they stack; at `md:` they sit in a row. The rest of the form
re-labels itself per choice ("Property price" → "Installment price" /
"Cash to the seller") so a field always says what it means in THIS deal.
Switching keeps every mode's values — flipping back and forth to compare
costs nothing to retype.

### 2. Only the fields this deal needs, in the order a person thinks

- Developer cash: the plan card collapses to one line — "Compared against
  the developer's plan: 10% down · 8 years · yearly — Edit" — because it
  is only the no-loan alternative. The cash discount sits next to the
  price with its result beneath: "Cash price 7,000,000 (30% off)".
- Resale: "What's left with the developer" — remaining amount, years,
  frequency — with the derived line "That's 1,250,000 a year, at the end
  of each year." The custom year-shares editor is not offered for resale
  (equal split only), so there is nothing to total to 100%.

### 3. The loan is an add-on card, closed until asked for

"**Pay with a bank loan**" is a card with a switch and one line: "Borrow
against your certificates and pay the bank monthly instead." Off by
default; on opens it, with fields in decision order:

1. **Borrow** — % of the up-front payment, with the amount beneath
   ("= 9,000,000 of the 10,000,000 you pay up front").
2. **Flat rate** and **years** — beneath them, the offer read back:
   "**240,000 / month** for 5 years · 5,400,000 interest in total ·
   ≈ 20.3% on a declining balance". This line is the main reason the
   flat rate stops being confusing.
3. **Certificate rate** — beneath: "Your 9,000,000 in certificates pays
   you **82,500 / month** while it is pledged."
4. **Bank terms** — a collapsed one-liner with the defaults as a
   sentence: "Bank lends 100% of the certificates · releases them when the
   loan is paid off — Change". Lending ratio and release mode (`Segmented`:
   When the loan ends / As I repay) live behind it; most people never
   open it.

The form has no price field — the calculator solves for it — so every
amount in these read-backs is **at the price the results show** (the
maximum, or the deal being checked), and says so. Before there is a
result, only the rate line shows ("≈ 20.3% on a declining balance").

Each new term has a "What's this?" disclosure (`<details>`, keyboard and
screen-reader native, never a hover tooltip) with two sentences:
*Pledge* ("Savings you put in certificates at the bank as security. They
keep paying interest but you cannot spend them until the bank releases
them."), *Flat rate* ("Interest on the full loan for every year, even as
you repay it — so 12% flat over 5 years costs about what 20% does on a
normal loan."),
*Lending ratio*, *Release*.

Rates entered here are prefilled as examples and labelled "Example —
enter your bank's offer" until the user edits one, so a default is never
mistaken for a quote.

### 4. Read the deal back in plain words

Above the results, a **"Your deal"** card states the whole plan as short
sentences, built live by a PURE, tested helper (`describeDeal`) from the
same simulation the numbers come from:

> You pay the seller **10,000,000** today — **9,000,000** from the bank,
> **1,000,000** from savings.
> **9,000,000** of savings is locked as the bank's guarantee, earning
> **82,500 / month**; it comes back after **5 years**.
> Then you pay the bank **240,000 / month** for 5 years, and the developer
> **1,250,000** at the end of each year for 4 years.

Money in `gain`, money out `loss`, locked money white — the colour rule
carries the meaning of every figure in the sentence. This card is the
answer to "did I enter it right?" before anyone reads a chart.

### 5. Lead the results with a verdict, then the evidence

When the loan is on, the results open with **one verdict line** above the
comparison, also from a pure tested helper (`loanVerdict`):

- "**The loan lets you afford 1,200,000 more.**"
- "**Without the loan you can afford 400,000 more.**"
- "**Same either way** — the loan only changes when you pay."

and one "why" line under it, e.g. "Interest 5,400,000 · your certificates
earn back 4,950,000 while pledged" (plus "· the cash discount saves …" for
a developer cash purchase). The verdict is
neutral white — a comparison is a position, not money moving.

Then the **comparison card**: two columns, With loan · Without loan, the
same five rows on both sides — Max you can afford · Lowest balance ·
Ends with · Interest paid · Net cost of the loan (interest − certificate
interest). Two columns of short figures fit a 360px phone; the row labels
sit once on the left. The larger side of each row is marked with a small
"higher" tag, not colour.

"Test a specific price" becomes **"Check this deal"**: enter the price (or
cash to the seller) and both sides recompute at it — feasible or not,
with the first month it fails.

### 6. Charts and tables stay readable with more going on

- **Chart:** one line is still the hero — the money you can spend. With a
  loan, a second thinner, muted (`white/30`) line shows "including the
  locked certificates", labelled directly at its end (no legend, two
  series). The buffer stays the ONE dashed line. A marker labels the
  release ("Certificates released · 9M"). The chart's `aria-label` is
  the verdict plus the lowest point, as a sentence.
- **Year card (phone):** a third group, **Bank**, after Paid and Covered
  by: Bank installments (`loss`), Certificate interest (`gain`), Locked /
  Released. Zero rows stay hidden, so a no-loan plan reads exactly as
  today.
- **Desktop table:** the bank columns appear only when the loan is on.

### 7. Feedback stays where the eye is

- Phone `LiveResult` strip: "Max 8.9M" plus, with the loan on, a small
  "+1.2M with loan" / "−400K with loan" beside it.
- Validation keeps today's machinery (`useVisibleErrors`, blur-then-show,
  the summary that focuses its field). New messages say what to do, not
  what is wrong: "Lending ratio must be more than 0% — most banks lend
  90–100%."
- A deal that cannot work says why in the deal's terms: "The bank's
  guarantee plus your share of the cash (10,000,000) is more than your
  savings (8,000,000)."

### Persistence

Per device, as today; `normalizeForm` defaults to developer installments
with the loan off, so existing devices open on the page they know.

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

Form tests in `lib/capacityForm` for the new fields' parsing, defaults,
field mapping and per-mode relabelling; a saved pre-loan form normalises to
developer installments with the loan off. `describeDeal` and `loanVerdict`
are tested on the resale example (10M to the seller, 9M loan at 12% flat
over 5 years, 11% certificates, 5M left over 4 years: 240,000 / month,
5,400,000 interest, 82,500 / month back) and on each verdict kind, with
"same" inside one solver step (1,000).

## Out of scope

Bank admin fees, early repayment, variable rates, a fixed loan cap,
certificate maturity dates, tax on certificate interest, property
appreciation, rent. The page's existing "what this does not model" note
gains the loan items.
