# Clients & God's share

_Approved in chat 2026-09-20. This file is the record; the implementation is the truth._

## Purpose

Mark works with several clients and wants to know, per client, how much they
paid him **this year**. Every income he records carries a **God's share** (a
tithe, 10% by default) that he sets aside; he wants to watch how much has
accrued, **settle** (actually pay out) some of it, and see what is still owed.

## Decisions

1. **One ledger.** A client's income record IS a normal `income` transaction
   with a client link. It appears in the Transactions month view, so monthly
   totals stay truthful; the client page is a filtered view of the same rows.
2. **God's share is a toggle on every income entry, on by default**, wherever
   the entry is added. On → an amount field prefilled at 10%, editable. Off → 0.
3. **Settling is an expense.** Paying God's share creates an expense
   transaction flagged as a God's share payment, so the month's net reflects
   the cash that actually left. The tracker sums those.
4. **Navigation.** "Clients" replaces the Reports placeholder in the pill.
   God's share gets its own page, `/gods-share`, reached from a tile on Home —
   which becomes a small real page.

Routine calls made without asking:

- Mark said "account"; the app says **client** (`clients` table, "Clients"
  tab). "Accounts" stays reserved for the not-yet-designed money-accounts
  feature.
- The 10% is a constant, `DEFAULT_GODS_SHARE_RATE` in `lib/ledger`. Per-user
  configuration through `user_settings` is an easy follow-up, not built.
- Deleting a client **unlinks** its transactions (`client_id = NULL`). The
  income and its accrued share stay in the ledger; nothing is ever deleted
  through the Clients page.
- Only income entries can be linked to a client. A client's "year" is the
  calendar year.
- Editing an existing income keeps its stored share; the 10% default only
  follows the amount while the share field has not been touched.

## Data

```sql
clients (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
UNIQUE INDEX clients_user_name ON clients (user_id, lower(name))

transactions + client_id  TEXT                                -- NULL = unlinked
transactions + gods_share NUMERIC(14,2) NOT NULL DEFAULT 0
INDEX transactions_user_client ON transactions (user_id, client_id, occurred_on)
```

**`gods_share` means the same thing on both kinds: "how much of this entry is
God's share money."** On an income row it is the amount set aside (accrued);
on an expense row it is the amount paid out of the share (settled). The
tracker is therefore two SUMs on one column:

```
accrued   = Σ gods_share WHERE kind = 'income'
settled   = Σ gods_share WHERE kind = 'expense'
remaining = accrued − settled
```

Validator invariant: `0 ≤ gods_share ≤ amount`, at most two decimals, snapped
to cents. An expense may not carry a client. Existing rows get 0 — no
back-fill.

Every read and write is filtered by the caller's `user_id`. The admin
`DELETE /api/users/{id}` cascade removes `clients` rows too.

## API (all behind the default-deny gate)

| route | does |
|---|---|
| `GET /api/transactions?month=` | as before, plus `clients: {id,name}[]` for the form's select |
| `POST` / `PUT /api/transactions[/{id}]` | body gains `client_id`, `gods_share`; a set `client_id` is checked with `fetchOwnedClient` first (another user's → 404) |
| `GET /api/clients?year=YYYY` | `{ year, clients: ClientSummary[] }` — each client with that year's income total, share and count, even when zero |
| `POST /api/clients` | `{name, note}` → 201 `{client}`; a duplicate name (case-insensitive) → 409 |
| `PUT /api/clients/{id}` | rename / note → `{client}` |
| `DELETE /api/clients/{id}` | one transaction: unlink its rows, delete the client → `{deleted}` |
| `GET /api/clients/{id}?year=YYYY` | `{ client, year, transactions }` — that year's income rows, newest first |
| `GET /api/gods-share` | `{ totals: {accrued, settled, remaining}, settlements: Transaction[] }` |

Validation is pure and tested (`src/lib/ledger/validate.ts`): the transaction
validator grows the two fields; `validateClientInput` — name trimmed, 1–60
chars; note ≤ 500.

## UI

- **The one form.** `TransactionForm` gains, for income, a Client select and a
  "Set aside God's share" toggle (on by default; for an existing entry, on iff
  `gods_share > 0`) with an amount field that tracks 10% of the amount until
  the user edits it; for expenses, a "Pay from God's share" toggle (off by
  default) that sets `gods_share = amount`. A `prefill` prop lets the client
  page ("+ Add income") and the tracker ("Settle") open it pre-set.
- **`/clients`** — year bar `‹ 2026 ›`, one card per client with the year's
  total in `gain` and a muted "God's share · entries" line; tap → the client.
- **`/clients/[id]`** — year bar, tiles Collected / God's share / Entries, the
  year's income rows grouped by day. Totals derive client-side from the list.
- **`/gods-share`** — tiles Accrued / Settled / Remaining (positions, so
  neutral), a Settle button, the settlements list.
- **Home** — "This month" (from the month endpoint) and "God's share"
  (Remaining) cards, each linking on.
- Colour follows the money rule: a year total is money in (`gain`); a
  settlement is money out (`loss`); the share on an income row is a portion,
  not a direction, and stays muted.

## Testing

Vitest for `src/lib/ledger` (share bounds and snapping, expense-with-client
rejected, `validateClientInput`, year helpers, `defaultGodsShare`, totals).
Then the full flow in the browser against Neon: create clients, add income with
the share on and off, settle, switch years, delete a client and see its income
survive unlinked, and cross-user isolation with a second account.
