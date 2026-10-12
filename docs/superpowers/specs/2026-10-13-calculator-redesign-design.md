# Real Estate calculator redesign — money once, plans side by side

_Agreed in chat 2026-10-13 ("Go and implement and I will judge when I see").
Supersedes `2026-10-12-cash-discount-tiers-design.md` (never built: a cash
tier is now just a plan) and reshapes the screen from
`2026-10-12-bank-loan-and-resale-design.md`. This file is the record; the
code is the truth._

## Why

Mark could not use the calculator: one deal at a time, the loan hidden inside
a smaller "down payment", fund returns, certificate interest and bank
installments mixed into one balance with no way to see which stream did
what. He wants to (1) see every money stream separately in every result
view, (2) say where his savings sit (a fund like Thndr, or a bank
certificate) as its own choice, (3) ask two questions — "what is the most I
can afford?" and "for this price, how much must I add a year?" — and (4)
compare several payment plans to pick the one that suits him.

## Decisions (from the chat)

1. **Mode (b) = yearly top-up.** Given a plan's price, find the smallest
   amount added every year — on top of savings and income, growing with the
   income's raise — so the fund never drops below the safety buffer (and
   meets the keep target).
2. **Savings vehicle: pick one** — "Fund (e.g. Thndr)": an effective yearly
   return, compounding monthly, minus the fee; "Bank certificate": a quoted
   yearly rate paid monthly (rate ÷ 12 a month, minus the fee/tax). Its
   return is its own line, never part of "capital".
3. **Saved plans, side by side.** Money is entered once; plans are a list of
   cards; a compare view ranks them; tap one for its full breakdown.
4. **Three steps**: ① Your money → ② Plans → ③ Compare, with a mode switch
   (Max price | Yearly top-up) at the top.

Routine calls made without asking:

- **One developer plan shape covers installments and cash deals:** discount
  % (off the list price), % paid now (of the discounted price), the rest over
  N years at a frequency (equal, or custom year shares). 10% now / 0% off is
  an installment plan; 100% now / 25% off is the cash deal. The engine's
  `developer-cash` kind goes away; saved forms migrate.
- **Resale stays its own kind** (cash to the seller + the seller's remaining
  developer balance over N years).
- **Extra costs and the bank loan belong to a plan** (they depend on the
  property and the deal); income, savings, safety rules belong to "Your
  money".
- **Plans are compared over ONE horizon** — the longest plan's (developer
  years or loan years) — so every final balance is measured on the same date
  and the keep target applies at the same moment.
- **Gross flows.** The up-front payment is shown in full as money out and
  the loan as money in (year 1), not netted. The maths is unchanged by this —
  only what is recorded and shown.
- The loan-vs-no-loan comparison stays, on the What if tab.
- The fund's rate is entered as an effective yearly yield; the
  nominal + compounding entry is dropped (a saved nominal rate migrates to
  its effective equivalent).
- Up to 6 plans; at least 1.

## The model

### Engine (`src/lib/capacity`) — still one deal per call

`CalculatorInputs` gains:

- `savingsVehicle?: "fund" | "certificate"` (absent = fund). The growth step
  becomes `fund: monthlyRate(effectiveAnnualRate) × (1 − fee)`,
  `certificate: effectiveAnnualRate / 12 × (1 − fee)` — the field holds the
  certificate's quoted annual rate in that case.
- `topUp?: number` — a yearly amount added on top of income. It lands with
  the income's frequency (monthly: `topUp / 12` every month; yearly: at
  months 12, 24, …) and grows by `income.annualIncrease` each year.

`PurchaseInput`: `kind: "developer-plan" | "resale"`; `cashDiscount` is
renamed `discount` and applies to the developer plan:

```
net      = price × (1 − discount)
upFront  = net × schedule.downPayment
stream   = buildInstallmentShares(schedule) × net
costBase = net
```

`schedule.downPayment = 1` is valid (nothing after). `price` is the LIST
price, so plans' maxima compare.

**Every flow is recorded separately.** `MonthPoint` gains `topUp`; month 0
carries `upFront`, `loanReceived` and `pledged` (zero on later months).
`YearSummary` replaces `downPayment` (the fund's share) with `upFront`
(gross, year 1) and `loanReceived` (year 1), and gains `topUp`. Every row
reconciles:

```
opening + returns + certificateInterest + income + topUp + loanReceived + released
        − upFront − pledged − installments − bankInstallments − extraCosts = closing
```

`SimulationResult` gains `totals: FlowTotals` (the same eleven flows summed
over the deal) and `startingCapital`, so the whole deal reconciles as
`startingCapital + Σin − Σout = finalBalance`.

### Solving (`solve.ts`)

- `maxFeasiblePrice` — unchanged.
- `minTopUp(inputs, price, step = 1_000, horizon?) → TopUpResult`
  `{ topUp: number | null; simulation: SimulationResult; blocker: "day-one" | "too-early" | null }`.
  0 when already feasible. Feasibility is monotonic in the top-up, so
  binary search on the step grid. When even an enormous top-up (1e12) is
  infeasible the top-up cannot help: `topUp: null`, `simulation` at top-up 0,
  `blocker: "day-one"` if the first breach is month 0 (the up-front payment
  or pledge needs more savings than there are), else `"too-early"` (a
  payment falls due before the first top-up arrives).
- `solvePlans(plans: CalculatorInputs[], ask: Ask, step?) → PlanResult[]`
  where `Ask = { mode: "max" } | { mode: "topUp"; prices: number[] }`. One
  common horizon (`max(horizonYears(plan))`). Each row: `{ maxPrice,
  topUp, simulation, blocker }`. `bestPlan(results, mode)` = highest
  max price / lowest top-up (null-safe, first wins a tie).
- `sensitivity` and `compare` gain a mode: in top-up mode they report the
  top-up needed instead of the maximum price.
- `withoutLoan` only switches the loan off.

### Validation

Engine rules stay in `inputProblems`; new: `topUp ≥ 0`, `discount` in
[0, 1), `savingsVehicle` rate in [0, 1].

## The form (`capacityForm.ts`, version 2)

```
CapacityForm = { version: 2, mode: "max" | "topUp", step: 1 | 2 | 3,
                 money: MoneyForm, plans: PlanForm[], selectedPlanId: string,
                 examplesEdited: boolean }
MoneyForm    = currency, startingCapital, savingsVehicle, fundRatePct,
               certificateRatePct, returnFeePct, incomeAmount,
               incomeFrequency, incomeIncreasePct, safetyBuffer, keepPct
PlanForm     = id, name (blank → automatic), kind ("developer" | "resale"),
               price (top-up mode), discountPct, nowPct, planYears,
               scheduleMode, yearPcts[], frequency, resaleRemaining,
               resaleYears, resaleFrequency, maintenancePct, maintenanceYear,
               finishingPct, finishingYear, loanEnabled, loanSharePct,
               loanFlatRatePct, loanYears, lendingRatioPct,
               loanCertificateRatePct, pledgeRelease, loanRatesEdited,
               testPrice
```

`parseForm` returns the money's errors and, per plan, `inputs | null`, its
errors and its `byField`. Field ids are `money.<field>` and
`plan.<id>.<field>` (custom years `plan.<id>.year-N`). **Migration:** a
version-1 form (no `version`) becomes its money + one plan named "Plan 1"
(developer-cash → developer with 100% now and that discount; a nominal rate
→ its effective equivalent).

Defaults: 5,000,000 in a fund at 20.33%; two example plans — "10% now · 8
years" (0% off, yearly) and "All now · 25% off" — labelled "Example plans —
replace them with your developer's offers." until a plan field is edited.
Automatic names: "10% now · 8 yrs", "All now · 25% off", "30% now, 10% off ·
6 yrs", "Resale · 5M over 4 yrs", "+ loan" appended when on.

## The screen

- **Top**: page title; a segmented **Max price | Yearly top-up**; a **step
  bar** "① Your money · ② Plans · ③ Compare" (each a 44px button with its
  number and label; current step `aria-current="step"`; a red dot on a step
  with a bad field). Next / Back buttons at the foot of steps 1 and 2.
- **① Your money**: Savings (amount, currency) · Where they sit (Fund |
  Certificate segmented, one rate field labelled for the choice, fees/tax) ·
  Income you add (amount, monthly/yearly, raise %) · Safety (buffer, keep %).
  Every field has a one-line hint.
- **② Plans**: one card per plan — name, one-line terms, its answer (max
  price or top-up) live — with Edit (expands the card inline), Duplicate,
  Delete (not on the last plan). "Add a plan" (hidden at 6). The editor:
  *Buying from* (Developer | Resale) · *What you pay* (developer: discount %,
  paid now %, rest over N years + frequency + custom split; resale: cash to
  seller is the answer in max mode or the price in top-up mode, remaining,
  years, frequency) · *Price* (top-up mode only) · *Bank loan* (toggle +
  today's loan fields) · *Extra costs* (maintenance, finishing).
- **③ Compare**: a ranked list of the plans — the answer, "Best" tag (a
  tag, not a colour), the terms line — each row a button selecting the plan.
  Under it the selected plan's detail in the four tabs:
  - **Answer** — the hero (max price, or the yearly top-up with "on top of
    your income"; "0 — you're already covered" when so; the blocker sentence
    when no top-up can help), then **"Where the money goes"**: one row per
    stream grouped by heading — *Your savings* (start, returns labelled
    "Fund returns" or "Certificate interest"), *What you add* (income,
    top-up), *Developer / seller* (paid now, installments), *Bank loan* (loan
    received, bank installments, pledge locked / returned, certificate
    interest on the pledge), *Costs* (maintenance + finishing) — each signed
    and coloured by the money rule, zero rows hidden, ending in "You end
    with". Then "Your deal" sentences.
  - **Over time** — the balance chart (spendable), with the pledge held as a
    second, muted area when there is a loan; the tooltip lists that month's
    flows grouped by the same headings.
  - **Year by year** — each year a card with the same headings and a
    subtotal per heading, opening → closing.
  - **What if** — return-rate sensitivity (max price or top-up), the
    loan-vs-no-loan comparison (when the plan has a loan), and "Check a
    price" (max mode).
- **Sticky answer strip** (phone, all steps): the selected plan's answer
  and its name; tapping goes to step ③. Desktop: the step bar sits in a
  sticky header; step ③ lays the ranking beside the detail from `lg:`.

## Testing

- Engine: certificate vs fund growth; discount + % now (10M, 10% off, 30%
  now → 2.7M up front, 6.3M stream, cost base 9M); 100% now has no stream;
  top-up lands per frequency and grows; the year reconciliation and the
  deal reconciliation hold for every kind with and without a loan;
  `minTopUp` (0 when covered, minimal on the grid, monotonic, both
  blockers); `solvePlans` common horizon; the reference 8,860,000 unchanged.
- Form: v1 migration (incl. developer-cash and nominal rate), per-plan
  errors with plan ids, automatic names, mode-dependent price requirement,
  normalize pads/clamps plans (0 plans → defaults, > 6 → first 6).
- Words: breakdown rows and grouping, top-up sentences, blocker sentences.

## Out of scope

Splitting savings between a fund and certificates, per-plan income,
property appreciation/rent, early loan repayment, a fixed approved loan cap.
