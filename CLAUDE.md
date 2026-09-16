@AGENTS.md

# My Wallet — Project Guide for Claude

Read this first. It is short on purpose; grow it as features land.

## What This App Is

A personal money app for **Mark**: track expenses and income, and a calculator
for real-estate buying capacity ("what can I actually afford?"). Mobile-first —
the primary surface is a phone. Multi-user, closed (no public page), with the
same auth and user-management model as EGX Analytics (`D:\Projects\egx-api`).

**Status:** auth, user admin, PWA and navigation are built and verified; the
**Transactions** tab is the expense/income ledger (see *Transactions — the
ledger*); the **Real Estate** tab holds the installment buying-capacity
calculator (see *Real Estate — buying capacity*). Home and Reports are still
`PlaceholderPage`s — the ledger's month endpoint is what should feed them.
Design records live in `docs/superpowers/specs/`.

## Stack

- **Next.js 16** (App Router, Turbopack, `src/proxy.ts` — NOT `middleware.ts`,
  that name is deprecated in 16), **React 19**, TypeScript, **Tailwind v4**
  (CSS-first config in `globals.css`, no `tailwind.config`).
- **Vitest** for the pure modules (`npm test`); the `@/*` alias is mirrored in
  `vitest.config.ts`.
- **Postgres (Neon)** via `postgres` (postgres.js). No ORM, no migration tool:
  `src/server/db.ts::initDb` runs idempotent DDL on the first request of every
  process. Add tables there with `CREATE TABLE IF NOT EXISTS`, add columns
  with `ADD COLUMN IF NOT EXISTS`, never rewrite what exists.
- **Auth:** `bcryptjs` over a SHA-256 pre-hash, `jose` HS256 JWT (30 days).
- Deploys to **Vercel**. Env vars: `DATABASE_URL`, `AUTH_SECRET`,
  `AUTH_USERS`, `AUTH_ADMINS`, `NEXT_PUBLIC_APP_URL` (see `.env.example`).

> `AGENTS.md` (maintained by `next dev`) points at `node_modules/next/dist/docs/`.
> Read the relevant page there before using a Next API you have not used in 16.

## Layout

```
src/
  proxy.ts                 # BOTH gates: page redirects + /api/* default-deny
  lib/ledger/              # PURE ledger helpers + tests: validate, months, summarize, groupByDay
  lib/capacity/            # PURE maths for the buying-capacity calculator + its tests
    types.ts               #   the contract: fractions, plain currency numbers
    rates.ts               #   effective <-> nominal, monthly/daily rates
    schedule.ts            #   down payment + yearly shares -> fraction due per month
    simulate.ts            #   the month-by-month engine, validateInputs
    solve.ts               #   maxFeasiblePrice (binary search), sensitivity
    fixtures.ts            #   the spec's reference scenario (8,860,000)
  server/                  # server-only — never import from a client component
    db.ts                  # pool singleton, initDb (schema + env seed), getDb()
    token.ts               # JWT sign/verify + PUBLIC_ENDPOINTS (no DB import)
    auth.ts                # hash/verify, getCurrentUser, requireAdmin, seedUsersFromEnv
    users.ts               # /api/users validation + the two guards
    transactions.ts        # the one spelling of the ledger's queries, all user-scoped
    http.ts                # HttpError, handle(), readJson()
  app/
    layout.tsx             # fonts, PWA metadata, Navbar / main / footer / BottomTabBar
    globals.css            # the design system (see below) + nav clearance vars
    page.tsx               # Home            (placeholder)
    transactions/          # Transactions — the ledger
    real-estate/           # Real Estate — the buying-capacity calculator
    reports/               # Reports         (placeholder)
    admin/                 # Users — admin only
    login/
    api/auth/{login,me}    # POST login (the only public route), GET me
    api/users[/[id]][/password]
    api/transactions[/[id]]  # GET ?month · POST · PUT · DELETE, all user-scoped
    lib/api.ts             # fetchJSON (attaches token, 401 → sign out) + users calls
    lib/authStore.ts       # localStorage + presence cookie + useSyncExternalStore store
    lib/capacityForm.ts    # the calculator's form (strings, %) -> CalculatorInputs; tested
    lib/capacityFormStore.ts # remembers the form per device (same pattern as authStore)
    lib/format.ts          # formatMoney (whole units) / formatAmount (keeps piastres) / compact / pct
    lib/numbers.ts         # parseNumber — "5,000,000" → 5000000
    components/            # AuthProvider, Navbar, BottomTabBar, admin dialogs, skeletons
    components/ui.tsx      # Card, Field, NumberInput, Segmented, Select, Stat — the form kit
    components/ledger/     # LedgerPage (month view), TransactionForm, TransactionList
    components/capacity/   # CapacityCalculator + RateInput, ScheduleEditor, BalanceChart,
                           #   YearTable, SensitivityTable
public/
  manifest.json, sw.js, icons/wallet-*
```

## Design system (from EGX)

Five colours and two fonts, declared once in `globals.css` under `@theme`:

| token | value | meaning |
|---|---|---|
| `charcoal-dark` | `#0a0a0f` | page background |
| `charcoal` | `#12121a` | card background |
| `gain` | `#00ff88` | a REAL positive direction (money in) |
| `loss` | `#ff3355` | a REAL negative direction (money out) |
| `accent` | `#4488ff` | interactive / selected |

Fonts: **Outfit** (sans) and **JetBrains Mono** (mono, for usernames, amounts,
codes) via `next/font/google`, exposed as `--font-outfit` /
`--font-jetbrains-mono` and mapped to `font-sans` / `font-mono`.

**`gain` and `loss` are never decoration.** Green means money came in, red
means money went out. A label, an icon, a category — nothing else gets either.

Recurring shapes: cards are `rounded-xl border border-white/10 bg-charcoal`;
inputs `rounded-lg border-white/10 bg-white/5 text-[16px] md:text-sm` (16px
prevents iOS zoom); primary buttons `bg-accent text-charcoal-dark font-semibold
min-h-[44px]`; muted text `text-white/50`, `/40`, `/25`.

### Two CSS variables you must read, never restate

- **`--bottom-nav-clearance`** = `calc(env(safe-area-inset-bottom) + 70px)` on
  mobile, `0px` at `md:`. Anything that must sit clear of the floating pill
  nav (a FAB, the footer, a back-to-top button) reads this. EGX had three
  hardcoded copies and two drifted — one omitted the safe-area term, so the nav
  painted over a FAB on any phone with a home indicator.
- **`--top-nav-clearance`** = `calc(env(safe-area-inset-top) + 61px)`. `Navbar`
  is `sticky top-0 z-50` at every width; a sticky element beneath it must use
  this as its `top`, or it parks under the nav and vanishes on scroll.

Change the pill's or the nav's geometry and change the variable in the same
breath.

## Mobile-first conventions

- `md:` (768px) is the breakpoint. Bottom pill on mobile (`md:hidden`), link
  row in the Navbar on desktop.
- Tables → cards on mobile (`space-y-3 md:hidden` + `hidden md:block`).
- Forms → full-screen modal on mobile, centred card on desktop (`CreateUserModal`).
- Touch targets `min-h-[44px]`. Navbar action buttons are deliberately 36px
  (`h-9`) — the nav row is 61px and `--top-nav-clearance` IS that number.
- Money inputs will use `step="any"`, never `step={0.01}` — EGP amounts
  routinely carry three decimals and the browser rejects them otherwise.
- **Every route segment has a `loading.tsx`.** Without one there is no Suspense
  boundary and a nav tap does not commit until the whole page is ready — on a
  phone the tap reads as dead. Add a route, add its `loading.tsx`, built from
  `LoadingSkeleton`.

### The bottom nav is a floating pill, not a bar

`BottomTabBar`: a centred capsule `h-[52px] w-full max-w-[320px] rounded-full
bg-charcoal/85 backdrop-blur-xl`, 8px above the safe area. The `<nav>` is
`pointer-events-none` with `pointer-events-auto` on the pill, so the gutters
either side stay tappable. Four `flex-1` tabs, each a 44px target with a 21px
icon and 10px label. Keep it at four — a fifth squeezes the labels.

**The active highlight is ONE `<span>` that slides** (`transform 340ms
cubic-bezier(0.34, 1.4, 0.5, 1)`), measured from the anchors' `offsetLeft` /
`offsetWidth` — never computed from the tab count. Three load-bearing details,
each a bug once:

- Query `rail.querySelectorAll("a")`, not `rail.children` — the highlight is
  itself a child.
- `isAuthenticated` and the tab count are in the layout-effect deps; the bar
  renders `null` while auth loads and must re-measure when it appears.
- "Placed yet" is **state**, not a ref, so the transition arms after the first
  paint instead of staying `none`.

**Tailwind v4 gotcha (found here):** do not put `-translate-y-1/2` on the
highlight. v4 emits it as the `translate` property, which COMPOSES with the
inline `transform: translate(x, -50%)` — the −50% applied twice and the pill
floated half out of the bar. Vertical centring lives in the inline transform
only.

Verify the slide with `el.getAnimations()`, not by sampling frames —
`requestAnimationFrame` and CSS timelines do not advance in a hidden preview
pane, so a frame sample "proves" nothing moved.

## Auth and user management — the EGX model

**The app is CLOSED.** No landing page, no registration, no anonymous API.

Two gates, both in `src/proxy.ts`:

1. **Pages** redirect to `/login?next=…` unless the `wallet.auth.present`
   cookie is set. UX only — the cookie is set by client JS and unsigned.
2. **`/api/*` is default-deny.** Every request needs a Bearer token with a
   valid signature unless the exact `"METHOD /path"` is in `PUBLIC_ENDPOINTS`
   (`server/token.ts`) — today only `POST /api/auth/login`. A route added
   tomorrow 401s until someone deliberately opens it. Route handlers then call
   `getCurrentUser(req)` / `requireAdmin(req)`, which **re-read role and
   `is_active` from the DB on every request** — a 30-day token must not let a
   disabled user keep working for a month.

Users: `users(id, username UNIQUE, password_hash, created_at, role, is_active)`.

- **Admin status comes ONLY from `AUTH_ADMINS`**, re-applied on every boot. No
  API route writes `role`; the admin UI has no role picker. Demotion of
  unlisted users happens only when the var is non-empty.
- **`AUTH_USERS=a:pw,b:pw` only CREATES missing users.** It never re-hashes,
  so an admin's password reset survives a cold start.
- `/api/users` (admin only): list, create, `POST {id}/password` reset,
  `PATCH {id}` enable/disable, `DELETE {id}`. A generated password (16 chars,
  no `0O1lI`) is returned **once** — `PasswordRevealDialog` says so and copies
  `Link / Username / Password` as one block (plus "Copy password only" for
  WhatsApp).
- Guards: you cannot disable or delete **yourself** or the **last active
  admin**.
- **`DELETE` must remove every row that carries the user's `user_id`**, in one
  `sql.begin` transaction, before the user row. Nothing has an FK to `users`.
  Today that is `transactions` and `user_settings`; **add every new per-user
  table to that list in the same commit that creates it.**
- **Logout wipes Cache Storage** (`clearStoredAuth`). `sw.js` falls back to
  cache offline, so without the wipe a signed-out shared phone could re-serve
  the last screens it saw.

Client side, `lib/authStore.ts` holds token + user in localStorage and exposes
them through `useSyncExternalStore` (server snapshot = signed out), so there is
no hydration mismatch and no setState-in-effect. `AuthProvider` validates the
stored token against `/auth/me` on every load; `lib/api.ts::fetchJSON` turns
any 401 into a sign-out.

Errors are `{ detail: string }` with an HTTP status — throw `HttpError` inside
a `handle()`-wrapped route and the client shows `detail`.

## PWA

`public/manifest.json` (standalone, portrait, maskable 192/512 + SVG),
`public/sw.js` (network-first for `/api/*` and navigations with cache
fallback, cache-first for static; **bump `CACHE_NAME` to invalidate the
shell**), registered by `ServiceWorkerRegistrar`. iOS meta via `appleWebApp`
in `layout.tsx`; `viewportFit: "cover"` so `env(safe-area-inset-*)` is live.
Nothing is served stale-while-revalidate today — a user's own ledger must
never paint a stale copy first.

## Transactions — the ledger

One entry = `kind` (expense | income) · `amount` · `occurred_on` · `category`
· `note`, per user. Spec: `docs/superpowers/specs/2026-09-16-transactions-ledger-design.md`.

**Table:** `transactions(id, user_id, kind, amount NUMERIC(14,2), occurred_on
TEXT, category, note, created_at, updated_at)` + index `(user_id,
occurred_on)`. NUMERIC so sums are exact; read back `::float8`. Dates are ISO
text like everywhere else — a month is the half-open string range
`[YYYY-MM-01, next-01)` from `lib/ledger/months.ts`.

**Every query is in `server/transactions.ts` and every one filters on the
caller's `user_id`.** `fetchOwned` 404s for another user's row and for a
missing one alike — which it is, is not the caller's business. The admin
delete cascade includes this table.

**One validator, both sides.** `lib/ledger/validate.ts::validateTransactionInput`
is called by the API route AND by `TransactionForm` on submit, so a value the
form accepts is a value the server accepts. Amounts snap to cents
(`0.1 + 0.2` is stored as `0.3`); dates must be real calendar days in
1970–2100; category ≤ 40, note ≤ 500.

**The list IS the month.** `GET /api/transactions?month=` returns the whole
month (newest day first, newest-created first within a day) plus the user's
distinct categories per kind; the page derives totals (`summarize`) and day
groups (`groupByDay`) from that list with the pure helpers, so nothing on
screen can disagree with the rows.

UI rules: amounts use `formatAmount` (keeps piastres, drops `.00`), never
`formatMoney`; income `gain`, expenses `loss`, net by sign; day labels come
from fixed arrays, not `Intl` (locales differ on "Sep" vs "Sept"). The month
is `today` (via `useSyncExternalStore`, null on the server) shifted by an
offset — never a server-rendered `new Date()`, whose day may differ from the
phone's. While another month loads the previous list stays at 50% opacity.
The form overlay is `z-[60]` so the `z-50` pill nav cannot cover its Delete
button or steal a tap.

## Real Estate — buying capacity

The one feature so far. Spec: the user's savings sit in a fund; they buy an
off-plan property on installments, keep the unpaid balance invested, and pay
from the fund plus extra income. The calculator finds the MAXIMUM price whose
plan never drops the fund below a safety buffer (and, optionally, ends with a
chosen share of the starting capital still in the fund).

### The maths is pure and lives in `src/lib/capacity`

No React, no Next, no DB — so it is unit-tested directly (`npm test`, 70
tests) and could run on the server unchanged. Two conventions, stated in
`types.ts`, that every function follows:

- **Every rate and share is a FRACTION** (20.33% is `0.2033`, a 10% down
  payment is `0.10`). The UI multiplies by 100 at the edge and nowhere else.
- **Amounts are plain numbers** in the user's currency.

Timing rules, all load-bearing and all pinned by tests:

- Month 0: balance = capital − down payment. Each month, in order: growth →
  income → payments. Growth is `monthlyRate(effective) × (1 − fee)` and is
  earned on a POSITIVE balance only (no return on money you don't have; the
  model does not borrow).
- Yearly installments and yearly income land at the END of the year (month 12,
  24, …); quarterly at months 3/6/9/12; monthly every month. Extra costs
  (maintenance, finishing) land at the END of the year they are due.
- Feasible = down payment ≤ capital AND balance ≥ buffer every month (month 0
  included) AND final balance ≥ `minKeptShare × capital`.
- `maxFeasiblePrice` is a binary search on a 1,000 grid — feasibility is
  monotonic in price, and a test asserts it. `sensitivity` re-solves at
  −6/−3/0/+3 points, clamped at 0%.
- **`isFeasible` is `simulate(...).feasible`, deliberately.** A leaner second
  walk for the solver would be a second place the rules are spelled.

**Reference scenario** (`fixtures.ts`): capital 5,000,000 · 12% · 8 years ·
10% down · equal yearly · maintenance 8% in year 4 · 300,000 yearly income ·
buffer 500,000 → **8,860,000 exactly** — every cash flow lands at a year end,
so the monthly engine agrees with yearly steps to the pound (final balance
500,991). If this number moves, something in the timing rules moved.

### The UI keeps strings; the engine gets numbers

`lib/capacityForm.ts` holds the form as the user typed it (strings, percents)
and `parseForm` converts once. That is what lets "1." or "" sit in a field
without a fight; validation messages come from the same pass and replace the
results column until the form parses. The form persists per device in
localStorage (`wallet.capacity.form`) through `capacityFormStore.ts` —
`useSyncExternalStore`, server snapshot = defaults — and `normalizeForm` fills
any field a saved copy lacks, so adding a field is safe for existing devices.

**Custom schedules are blocked, not corrected**, until down payment + years
total exactly 100% (±0.01 pp for float noise); switching to custom prefills
the equal split so the user edits from a valid plan. The rate can be entered
as an effective yield OR nominal + compounding, and switching carries the
value across so the number never jumps.

### The chart is hand-rolled SVG, by the dataviz rules

`BalanceChart`: one series, so no legend; 2px `accent` line with a 10% wash;
solid hairline gridlines; the buffer is the ONE dashed line (a dash means
threshold, and it is one); the same path is redrawn in `loss` through a
clip wherever it dips under the buffer; crosshair + tooltip on hover/touch
with the value first; keyboard arrows move the crosshair; the year table is
the table-view twin. It measures its container with a `ResizeObserver` so
axis text stays 11px on a phone instead of scaling down with a viewBox.

**Colour in the year table follows the money rule:** returns and income are
`gain` (money in), installments and costs are `loss` (money out); balances
are positions and stay neutral; a year whose lowest balance breaches the
buffer is tinted `loss` — a real bad outcome.

**Preview-pane artefact worth knowing:** this page is large enough that React
streams it in a Suspense boundary (`<div hidden id="S:0">`) and reveals it via
`requestAnimationFrame`. In a hidden preview pane rAF does not tick, so the
hidden copy lingers beside the client-rendered one until a paint. It is not a
bug in the page; a screenshot (a paint) clears it.

## Lint rules that bite (eslint-config-next 16 / React 19)

- `react-hooks/set-state-in-effect`: no synchronous `setState` in an effect
  body, **including inside a function the effect calls** (an `async` helper
  with `await` still counts). Fetch with `.then(setX)`, derive loading from
  `data === null`, or read external state with `useSyncExternalStore`.
- `@next/next/no-location-assign-relative-destination`: use
  `useRouter().replace()` for internal navigation, not `window.location.href`.

## Running

```bash
npm run dev      # http://localhost:3000 — needs .env (copy .env.example)
npm run build    # also type-checks
npm run lint
npm test         # Vitest — the pure modules (src/lib, src/app/lib)
```

`.next/types/validator.ts` is written by `next build` and lists every route;
after renaming a route, `tsc` fails on it until the next build regenerates it.

First request creates the schema and seeds `AUTH_USERS` / `AUTH_ADMINS`.

**Pushing: `gh auth switch --user MarkBotros0` first** — the machine has
several `gh` accounts and the wrong one gets a 403 on `MarkBotros0/my-wallet`.

## Deliberately missing (so far)

- Any public surface, self-service password change, role editing in the UI —
  all inherited decisions from EGX.
- Accounts, recurring entries, budgets, multi-currency, a categories table
  (categories are free text with autocomplete from history) — **not designed
  yet.** Plan before building.
- The calculator models no borrowing, no property appreciation, no rent, and
  a constant return rate; the page says so. A price target with a direction
  attached is the thing EGX deliberately refuses to show, and this app should
  keep the same discipline if it ever grows a "projection".
