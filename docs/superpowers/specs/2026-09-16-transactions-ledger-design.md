# Transactions ledger — expense & income CRUD

_Approved in chat 2026-09-16. This file is the record; the implementation is the truth._

## Purpose

Record money in and money out, one entry at a time, per user. A month at a
time is the unit of reading: what came in, what went out, what is left.

## Scope

**In:** create / edit / delete a transaction; a month view with income,
expenses and net; category autocomplete from the user's own past entries.

**Out (deliberately):** accounts, recurring entries, multi-currency, budgets,
the Home summary tiles (a natural next step — the same endpoint feeds them).

## Data

```sql
transactions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,            -- 'expense' | 'income'
  amount      NUMERIC(14,2) NOT NULL,   -- > 0, in the user's currency
  occurred_on TEXT NOT NULL,            -- 'YYYY-MM-DD'
  category    TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
)
INDEX transactions_user_day ON transactions (user_id, occurred_on)
```

Every read and write is filtered by the caller's `user_id`. The admin
`DELETE /api/users/{id}` cascade removes this table's rows too.

`amount` is NUMERIC so sums are exact in SQL; it is read back as `::float8`.
Dates are ISO text like every other date in this app — string comparison
sorts them correctly and a month is the half-open range `[YYYY-MM-01,
next-01)`.

## API (all behind the default-deny gate)

| route | does |
|---|---|
| `GET /api/transactions?month=YYYY-MM` | the month's entries (newest first) + the user's distinct categories per kind |
| `POST /api/transactions` | create; body `{kind, amount, occurred_on, category, note}` → 201 `{transaction}` |
| `PUT /api/transactions/{id}` | replace the editable fields → `{transaction}` |
| `DELETE /api/transactions/{id}` | → `{deleted}` |

Validation is a pure, tested module (`src/lib/ledger/validate.ts`): kind in
the set; amount finite, > 0, ≤ 10¹², at most two decimals; a real calendar
date between 1970 and 2100; category ≤ 40 chars, note ≤ 500, both trimmed.
Errors come back as `{detail}` like every other route.

## UI — `/transactions`

- Header `‹ September 2026 ›` with a "This month" jump when elsewhere.
- Summary strip: Income (`gain`), Expenses (`loss`), Net (coloured by sign).
- Entries grouped by day, newest first; category bold, note muted, amount
  signed and coloured by direction. Tap a row → edit form with Delete.
- Form: Expense/Income toggle · amount · date (defaults to today) · category
  with `<datalist>` suggestions · note. Full-screen on mobile, centred card
  on desktop. `+` FAB clears the pill nav via `--bottom-nav-clearance`;
  "+ Add" button in the header on desktop.
- Totals and day grouping are computed client-side by pure helpers
  (`summarize`, `groupByDay`) from the month's list — the list IS the month.
- Simple refetch after every write; empty-month state; errors in a `loss` box.

## Testing

Vitest for `src/lib/ledger` (validation, month helpers, summarize, grouping).
Then the full flow in the browser against Neon: create, edit, delete, month
switching, and cross-user isolation with a second account.
