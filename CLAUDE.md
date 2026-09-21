@AGENTS.md

# My Wallet — Project Guide for Claude

Read this first. It is short on purpose; grow it as features land.

## What This App Is

A personal money app for **Mark**: track expenses and income, and a calculator
for real-estate buying capacity ("what can I actually afford?"). Mobile-first —
the primary surface is a phone. Multi-user with open sign-up; the token model
is EGX Analytics' (`D:\Projects\egx-api`), the admin role is not.

**Status:** auth, sign-up, PWA and navigation are built and verified; the
**Transactions** tab is the expense/income ledger (see *Transactions — the
ledger*); the **Clients** tab tracks what each client paid this year and
income carries a **God's share** that is settled from `/gods-share` (see
*Clients & God's share*); the **Real Estate** tab holds the installment
buying-capacity calculator (see *Real Estate — buying capacity*). **Home** is
the earnings dashboard (see *Home — earnings and God's share*). Design
records live in `docs/superpowers/specs/`.

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
- Deploys to **Vercel**. Env vars: `DATABASE_URL`, `AUTH_SECRET` — that is all
  (see `.env.example`).

> `AGENTS.md` (maintained by `next dev`) points at `node_modules/next/dist/docs/`.
> Read the relevant page there before using a Next API you have not used in 16.

## Layout

```
src/
  proxy.ts                 # BOTH gates: page redirects + /api/* default-deny
  lib/ledger/              # PURE ledger helpers + tests: validate, months/years, summarize,
                           #   groupByDay, godsShare (default share, totals),
                           #   summary (Home's charts from one grouped series)
  lib/account/             # PURE credentials validator + test (register route AND form)
  lib/capacity/            # PURE maths for the buying-capacity calculator + its tests
    types.ts               #   the contract: fractions, plain currency numbers
    rates.ts               #   effective <-> nominal, monthly/daily rates
    schedule.ts            #   down payment + yearly shares -> fraction due per month
    simulate.ts            #   the month-by-month engine, validateInputs
    solve.ts               #   maxFeasiblePrice (binary search), sensitivity
    fixtures.ts            #   the spec's reference scenario (8,860,000)
  server/                  # server-only — never import from a client component
    db.ts                  # pool singleton, initDb (schema), getDb()
    token.ts               # JWT sign/verify + PUBLIC_ENDPOINTS (no DB import)
    auth.ts                # hash/verify, getCurrentUser, nowIso, newId
    transactions.ts        # the one spelling of the ledger's queries, all user-scoped
                           #   (month list, client-year list, God's share sums, settlements)
    clients.ts             # the one spelling of the clients queries, all user-scoped
    http.ts                # HttpError, handle(), readJson()
  app/
    layout.tsx             # fonts, PWA metadata, Navbar / main / footer / BottomTabBar
    globals.css            # the design system (see below) + nav clearance vars
    page.tsx               # Home — earned this year, God's share owed, two charts
    transactions/          # Transactions — the ledger
    clients/[/[id]]        # Clients — per-client yearly income
    gods-share/            # God's share — set aside / settled / remaining, Settle
    real-estate/           # Real Estate — the buying-capacity calculator
    login/, register/      # the two signed-out pages, both on AuthCard
    account/               # Account — who is signed in, change password
    api/auth/{login,register,me,password}  # POST login + register are the public routes,
                           #   GET me, PUT password (current + new)
    api/transactions[/[id]]  # GET ?month · POST · PUT · DELETE, all user-scoped
    api/clients[/[id]]     # GET ?year · POST · PUT · DELETE (unlinks) · GET {id}?year
    api/gods-share         # GET totals + settlements
    api/summary            # GET ?month — everything Home shows, in one response
    lib/api.ts             # fetchJSON (attaches token, 401 → sign out) + every typed call
    lib/ticks.ts           # niceTicks — the one axis-tick scale every chart uses
    lib/chartLabels.ts     # placeLabels — direct labels by priority, clear of each other and the data
    lib/authStore.ts       # localStorage + presence cookie + useSyncExternalStore store
    lib/today.ts           # useToday — the phone's date, null on the server
    lib/capacityForm.ts    # the calculator's form (strings, %) -> CalculatorInputs; tested
    lib/capacityFormStore.ts # remembers the form per device (same pattern as authStore)
    lib/format.ts          # formatMoney (whole units) / formatAmount (keeps piastres) / compact / pct / share
    lib/initials.ts        # initials — a name's monogram ("Acme Corp" → "AC"); tested
    lib/numbers.ts         # parseNumber — "5,000,000" → 5000000
    components/            # AuthProvider, AuthCard, Navbar, BottomTabBar, Fab, skeletons
    components/account/    # AccountPage (the change-password form)
    components/ui.tsx      # Card, Field, NumberInput, Segmented, Select, CheckRow, Stat — the form kit
    components/ledger/     # LedgerPage (month view), TransactionForm (THE entry form),
                           #   TransactionList, PeriodBar (‹ month/year ›), Tile
    components/clients/    # ClientsPage (hero + roster), YearSplitBar, ClientPage, ClientForm
    components/godsShare/  # GodsSharePage
    components/home/       # HomePage + ClientBars (by client), MonthlyChart (over the year)
    components/capacity/   # CapacityCalculator + RateInput, ScheduleEditor, BalanceChart,
                           #   YearTable, SensitivityTable, formErrors (per-field errors),
                           #   LiveResult (the phone's sticky answer strip + the desktop's
                           #   condensed bar, DesktopResultBar)
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

Recurring shapes, each a `@utility` in `globals.css` so depth and motion are
spelled once (added 2026-09-21):

- **`surface`** — THE solid card: charcoal, the hairline, a 1px top-edge
  highlight and one soft shadow. Every card, tile, list and period bar is
  `surface`; never re-spell `rounded-xl border border-white/10 bg-charcoal`.
  The dashed empty-state boxes are deliberately not surfaces.
- **`pressable`** — a tappable card/pill: settles to `scale(0.98)` on press,
  transform only, 150ms on the one easing.
- **`btn-primary`** — THE primary button: accent, an accent glow, the press,
  the disabled fade. Layout (`min-h-[44px] px-4 text-sm`) stays at the call
  site.
- **`shimmer`** — a loading placeholder's light sweep (`LoadingSkeleton`).
- Motion tokens: `--ease-out-expo` and `animate-rise` / `animate-grow-x` /
  `animate-grow-y` (300–400ms, transform/opacity only). Stagger with an
  inline `animationDelay`, 40ms a step. **Every animation and transition is
  cut to nothing under `prefers-reduced-motion`** by one rule in the base
  layer — do not add per-component checks.
- The body carries an **ambient accent glow** from above the top edge (a
  radial gradient on `body`), so the page is a lit surface, not flat black.

Inputs `rounded-lg border-white/10 bg-white/5 text-[16px] md:text-sm` (16px
prevents iOS zoom); muted text `text-white/50`, `/40`, `/25`.

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
- Forms → full-screen modal on mobile, centred card on desktop (`TransactionForm`).
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
either side stay tappable. Four `flex-1` tabs (Home · Transactions · Clients ·
Real Estate), each a 44px target with a 21px icon and 10px label. Keep it at
four — a fifth squeezes the labels; God's share is reached from Home, not a tab.

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

## Auth — open sign-up, no admin

**Anyone with the URL can create an account** (`/register`). This reversed
the closed, admin-managed model on 2026-09-20 — spec:
`docs/superpowers/specs/2026-09-20-open-registration-design.md`. Every ledger
row is user-scoped, so a stranger gets an empty ledger of their own and
nothing else. There is no admin role, no Users page, no e-mail and no
password recovery: a forgotten password is a row edit in the database.

Two gates, both in `src/proxy.ts`:

1. **Pages** redirect to `/login?next=…` unless the `wallet.auth.present`
   cookie is set; `/login` and `/register` are the only public pages. UX
   only — the cookie is set by client JS and unsigned.
2. **`/api/*` is default-deny.** Every request needs a Bearer token with a
   valid signature unless the exact `"METHOD /path"` is in `PUBLIC_ENDPOINTS`
   (`server/token.ts`) — today `POST /api/auth/login` and
   `POST /api/auth/register`. A route added tomorrow 401s until someone
   deliberately opens it. Route handlers then call `getCurrentUser(req)`,
   which **re-reads the user row on every request** — a 30-day token must
   not outlive a row that was deleted by hand.

Users: `users(id, username UNIQUE, password_hash, created_at)`. Databases
from before 2026-09-20 also carry `role` and `is_active` columns from the
admin model; they have defaults, nothing reads them, nothing drops them.
Nothing deletes a user through the app, so there is no cascade to maintain;
`transactions`, `clients` and `user_settings` still key on `user_id`.

**One validator, both sides:** `lib/account/validate.ts::validateCredentials`
is called by the register route AND by the register form on submit —
username trimmed + lower-cased, `^[a-z0-9._-]{3,32}$`; password ≥ 8 chars
and **never trimmed** (login does not trim either, so what was typed at
sign-up is what signs in). A taken username is a `409` from the `UNIQUE`
violation, not a pre-select, so two racing sign-ups cannot both win.
`register` returns exactly the login response (`access_token`, `user`), so
`AuthProvider` stores both through one `authenticate` helper.

**Changing a password (added 2026-09-21):** `PUT /api/auth/password` with
`{ currentPassword, newPassword }`, gated like every other route (not in
`PUBLIC_ENDPOINTS`), verifies the current password against the row before
writing the new hash. The same validator is on both sides again —
`validatePasswordChange` (current required, new ≥ 8 and different, neither
trimmed). A wrong current password is a **400, never a 401** — `fetchJSON`
signs the user out on any 401, and a typo must not. The page is `/account`
(username in the desktop nav, a user icon beside Logout on the phone), with
a confirm field because there is no recovery. **Only the hash changes:**
tokens are 30-day JWTs with no revocation, so other devices stay signed in
until their token expires — chosen over a `password_changed_at` + `iat`
check to stay simple; that is the upgrade if a lost phone ever needs
locking out.

**Logout wipes Cache Storage** (`clearStoredAuth`). `sw.js` falls back to
cache offline, so without the wipe a signed-out shared phone could re-serve
the last screens it saw.

Client side, `lib/authStore.ts` holds token + user (`{id, username}`) in
localStorage and exposes them through `useSyncExternalStore` (server
snapshot = signed out), so there is no hydration mismatch and no
setState-in-effect. `AuthProvider` validates the stored token against
`/auth/me` on every load; `lib/api.ts::fetchJSON` turns any 401 into a
sign-out. `/login` and `/register` share `AuthCard` (shell, input and
button classes, `withNext` to carry `?next=` between them).

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

One entry = `kind` (expense | income) · `amount` · `occurred_on` ·
`client_id` · `gods_share`, per user. Spec:
`docs/superpowers/specs/2026-09-16-transactions-ledger-design.md`; the last
two fields are from `2026-09-20-clients-and-gods-share-design.md`. **There is
no category and no note** (removed 2026-09-21): every income is salary, so
the fields said nothing. The 2026-09-16 spec still describes them; a row is
who it was collected from, when, and how much.

**Table:** `transactions(id, user_id, kind, amount NUMERIC(14,2), occurred_on
TEXT, client_id TEXT NULL, gods_share NUMERIC(14,2) DEFAULT 0, created_at,
updated_at)` + indexes `(user_id, occurred_on)` and `(user_id, client_id,
occurred_on)`. Databases from before 2026-09-21 also carry `category` and
`note` (both `DEFAULT ''`, so inserts that omit them succeed); nothing reads
or drops them, like `users.role`. NUMERIC so sums are exact; read back
`::float8`. Dates are ISO text like everywhere else — a month is the
half-open string range `[YYYY-MM-01, next-01)` from `lib/ledger/months.ts`,
a year `[YYYY-01-01, next-01-01)`.

**Every query is in `server/transactions.ts` and every one filters on the
caller's `user_id`.** `fetchOwned` 404s for another user's row and for a
missing one alike — which it is, is not the caller's business.

**One validator, both sides.** `lib/ledger/validate.ts::validateTransactionInput`
is called by the API route AND by `TransactionForm` on submit, so a value the
form accepts is a value the server accepts. Amounts snap to cents
(`0.1 + 0.2` is stored as `0.3`); dates must be real calendar days in
1970–2100; `0 ≤ gods_share ≤ amount`; a `client_id` on an expense is
refused. A `category` or `note` a stale client still sends is dropped, not
stored — a test pins it.

**The list IS the month.** `GET /api/transactions?month=` returns the whole
month (newest day first, newest-created first within a day) plus the user's
clients (for the form's select); the page derives totals (`summarize`) and
day groups (`groupByDay`) from that list with the pure helpers, so nothing
on screen can disagree with the rows. A row is titled by its client's name;
an entry with no client (every expense, unlinked income) by its kind, muted.

**`TransactionForm` is THE entry form.** The client page and the God's share
page open the same component with a `prefill` (`kind`, `client_id`,
`godsShareOn`, `amount`) rather than growing forms of their own.

UI rules: amounts use `formatAmount` (keeps piastres, drops `.00`), never
`formatMoney`; income `gain`, expenses `loss`, net by sign; day labels come
from fixed arrays, not `Intl` (locales differ on "Sep" vs "Sept"). The month
is `today` (via `useSyncExternalStore`, null on the server) shifted by an
offset — never a server-rendered `new Date()`, whose day may differ from the
phone's. While another month loads the previous list stays at 50% opacity.
The form overlay is `z-[60]` so the `z-50` pill nav cannot cover its Delete
button or steal a tap.

## Clients & God's share

Spec: `docs/superpowers/specs/2026-09-20-clients-and-gods-share-design.md`.

**A client is who income is collected from — NOT a money account.** "Accounts"
(bank, cash, wallet) stay undesigned. `clients(id, user_id, name, note,
created_at, updated_at)` with a unique index on `(user_id, lower(name))`; the
route turns the violation into a 409 with the name in it. Queries live in
`server/clients.ts`, all user-scoped; `fetchOwnedClient` 404s like
`fetchOwned`. Writing a transaction with a `client_id` runs `fetchOwnedClient`
first, so another user's client id is a 404, not a link.

**Deleting a client UNLINKS, never deletes.** `DELETE /api/clients/{id}` nulls
`client_id` on its rows and removes the client in one `sql.begin` — the income
happened and its share is still owed. The form's confirm says so.

**God's share is one column with one meaning: "how much of this entry is
God's share money."** On an income it is the amount set aside (accrued); on an
expense it is the amount paid out (settled). The tracker is two `SUM`s —
`server/transactions.ts::godsShareTotals` — and `lib/ledger/godsShare.ts::
godsShareTotals` is its client-side twin over a list. There is no settlements
table and no settle verb: a settlement IS an expense with `gods_share` set,
written through `POST /api/transactions`, so the month it lands in shows the
cash leaving. `DEFAULT_GODS_SHARE_RATE = 0.1` is a constant (a fraction, like
every rate here); a per-user rate would go in `user_settings`, not built.

Form rules: on an income the toggle is on by default and the share field
follows 10% of the amount until the user types in it (`shareTouched`); an
existing entry's stored share counts as typed. On an expense the toggle is off
by default and means the WHOLE expense settles (`gods_share = amount`).
Switching kind resets the toggle to that kind's default — the two toggles
answer different questions.

Pages: `/clients` (see *The Clients page* below), `/clients/[id]` (the year's income rows; tiles derive
from that list — the list IS the year), `/gods-share` (Set aside / Settled /
Remaining + settlements; "Settle" prefills an expense at the remaining
amount with the share toggle on — that toggle, not a label, is what makes
it a settlement; `?settle=1` opens that form on load — Home's
Settle button — and closing it drops the flag). `useToday` (`lib/today.ts`),
`PeriodBar`, `Tile` and `Fab` are shared — do not copy them into a new page.

**Colour follows the money rule here too:** a client's year total is `gain`
(money in), a settlement row is `loss` (money out), the share on an income
row and every tracker tile are positions and stay muted/white.

### The Clients page — the year, and who made it (redesigned 2026-09-21)

`ClientsPage` is one hero and one roster, in Home's grammar, so the page
has hierarchy instead of three equal tiles over a stack of identical cards:

- **The hero** is the year's income — `text-4xl md:text-5xl` in `gain`,
  counting up (`useCountUp`) over the same soft green wash as Home's
  "Earned in" card, so the number the user tapped through from looks the
  same here. Beneath it, **`YearSplitBar`**: how the year splits across
  clients, one segment each in the roster's order, all `gain` (one series,
  all money in) with 2px gaps doing the separating, and the income with no
  client last at `gain/25`. Its segments are `lib/ledger/summary.ts::
  clientBars` — the same helper as Home's bars, so it adds up to the
  headline. Then one caption: God's share · entries · "N with no client".
- **The roster** is one `surface` with `divide-y` rows, not a card per
  client: a monogram (`lib/initials.ts`, neutral white tint — never
  `gain`/`loss`/`accent`), the name, `"50% of 2026 · 8 entries"`
  (`formatShare`: whole points, `<1%` for a client that rounds to nothing),
  the total in `gain`, a `›`. A client with nothing this year keeps its row
  at the bottom (the server's sort) and dims. Per-client God's share is NOT
  on the row — the hero has the year's total, the client's page its own.
- **Whole units.** This page uses `formatMoney` (no decimals) — Mark's
  explicit ask, 2026-09-21 — the one exception to the ledger's
  `formatAmount` rule: the roster compares clients, and piastres are noise
  at that distance. `/clients/[id]` and its `TransactionList` still keep
  them.
- Arrival is one sequence, like Home: hero rises (0ms) → count-up → bar
  grows (200ms) → roster rises (80ms). Rows do not stagger. The route's
  `loading.tsx` and the in-page skeleton are `ChartSkeleton` +
  `ListSkeleton` (the grouped-list shape, in `LoadingSkeleton.tsx`).

## Home — earnings and God's share

Home answers the two questions the app exists for: **how much have I
earned** and **where does God's share stand**. Spending never appears on it.
It used to show the month's net (income − expenses), which went red the
moment a year's share was settled in one month — a settlement is money
given, not money lost, so Home no longer has a number that can go negative
(reversed 2026-09-21).

- **One request:** `GET /api/summary?month=YYYY-MM` (the phone's month, from
  `useToday`) returns the month's and the year's income (`incomeTotals`), the
  share totals all time (`godsShareTotals` — the same three numbers as the
  tracker, so they cannot disagree with it), the year's per-client totals
  (`listClientsForYear`) and `incomeByMonthAndClient`: income summed per
  `(month, client_id)`. **Both charts derive from that one series** with the
  pure helpers in `lib/ledger/summary.ts` — `clientBars` (sum over months,
  biggest first, plus a "No client" bar so the bars add up to the headline)
  and `monthlyIncome(series, year, filter)` (sum over clients, or one, or the
  unlinked) — so the charts, the headline and the Clients page agree.
- **Cards:** "Earned in {year}" is the page's hero figure — the display
  sans at 36px in `gain` (money in), counting up on arrival
  (`lib/useCountUp.ts`, instant under reduced motion) over a soft green
  wash; this month beneath; the link to Clients. "God's share" (Owed
  headline, Set aside · Settled beneath, all positions so white, plus a
  meter of settled ÷ set aside in `accent`) is a stretched link to the
  tracker with a Settle button above it in the stacking order that opens
  `/gods-share?settle=1`. The page arrives top to bottom: `animate-rise`
  40ms a step, bars `grow-x`, columns `grow-y` (re-keyed by the filter so
  a new series rises again).
- **Charts, by the dataviz rules:** one series each, so no legend and one
  hue — `gain`, because it is money in. `ClientBars` is a list with bars
  (value beside the name, so it is its own table view; each row a 44px
  link to the client). `MonthlyChart` is hand-rolled SVG measured with a
  ResizeObserver like `BalanceChart`: columns ≤ 24px with a 4px rounded
  cap and a square foot, **every column labelled on its cap** (Mark's ask,
  2026-09-21 — the dataviz "selective labels" rule is deliberately set
  aside here; three significant figures where the band fits them, two and
  9px on a phone, the tooltip keeps the exact amount), hairline
  solid gridlines, ticks from `lib/ticks.ts::niceTicks`, the whole month
  band as the hit target, value-first tooltip, arrow keys, an empty state
  instead of a bare axis. The client filter scopes only the monthly chart,
  so it sits in that card's header — a filtered by-client chart would be
  one bar.

## Real Estate — buying capacity

The one feature so far. Spec: the user's savings sit in a fund; they buy an
off-plan property on installments, keep the unpaid balance invested, and pay
from the fund plus extra income. The calculator finds the MAXIMUM price whose
plan never drops the fund below a safety buffer (and, optionally, ends with a
chosen share of the starting capital still in the fund).

### The maths is pure and lives in `src/lib/capacity`

No React, no Next, no DB — so it is unit-tested directly (`npm test`, 65
tests in `src/lib/capacity`) and could run on the server unchanged. Two conventions, stated in
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

### Validation: the engine says WHAT, the form says WHERE, the hook says WHEN

- **The input rules are spelled once, in the engine.** `simulate.ts::
  inputProblems` (and `schedule.ts::scheduleProblems`) return `{ field,
  message }` where `field` is a path into `CalculatorInputs`
  (`"income.annualIncrease"`, `"schedule.yearShares"`, …); `validateInputs`
  is just its messages. `parseForm` adds nothing but "is it a number" and
  maps engine fields onto form fields (`FormField`; custom-year inputs are
  `year-0`, `year-1`, …). It returns `errors` (blocking, in PAGE order — the
  engine's order is not the page's) and `byField` (every problem, first
  message per field, including the two that never block: the currency code
  and the test price).
- **`formErrors.tsx::useVisibleErrors` decides when a message shows:** after
  the field has been left (validate on blur — clearing a field to retype it
  must not flash "required"), or immediately for a field the user is not in
  (a saved form that no longer parses). Once shown it stays while being
  fixed. `CalcField` wires a `Field` + `NumberInput` + id + focus tracking
  from one `field` name; sub-editors reach the hook through
  `FormErrorsProvider`, not props. `Field`'s `error` flows to the input as
  `aria-invalid` / `aria-describedby` through a context — a call site passes
  `error` to the Field and nothing to the input. Two narrow fields in a row
  (`CostRow`, `CapitalRow`) share ONE error line beneath the pair via
  `errorId`.
- **The last valid result stays on screen, dimmed**, while the form does not
  parse (`lastInputs`, adjusted during render — not an effect), with the
  error summary above it; each summary item focuses its field
  (`focusField`, centred, respecting reduced motion).
- **On a phone `LiveResult` sticks under the nav** (`top` reads
  `--top-nav-clearance`, `lg:hidden`) and shows the maximum as it moves, or
  "N inputs need fixing" — tapping scrolls to `#results` (which carries a
  `scroll-margin-top` for the nav) or to the first bad field.
- **On a desktop `DesktopResultBar` does the same job** (`hidden lg:block`,
  zero height in flow at the top of the results column): a glass bar that
  fades in only once the headline block — error summary + hero — has
  scrolled under the nav (`useScrolledPast`, an IntersectionObserver whose
  root inset is the measured height of `nav.sticky`, never a restated 61).
  Maximum · ends with · % kept, or the error count with a "Fix" that
  focuses the first bad field; "Summary" scrolls back to `#results`.
- **From `xl:` the results use the width** (`xl:max-w-7xl`): the headline
  block full-width above a two-column grid — "Test a specific price"
  beside "If the fund's return changes" (the test card spans both when
  nothing is affordable), then the chart and the year table full-width.
  The DOM order is the phone order; `xl:order-*` places them. Cards arrive
  with `animate-rise` 40ms apart; the hero figure is 60px at `lg:` and its
  six tiles are one row at `xl:`, without the currency code (the figure
  states it once).
- Money inputs use `NumberInput group`: on blur a parsed value is rewritten
  with thousands separators; `parseNumber` strips them again.

### The chart is hand-rolled SVG, by the dataviz rules

`BalanceChart({ inputs, sim, currency })`: one series, so no legend; 2px
`accent` line with a 10% wash; solid hairline gridlines; the buffer is the
ONE dashed line (a dash means threshold, and it is one); the same path is
redrawn in `loss` through a clip wherever it dips under the buffer;
crosshair + tooltip on hover/touch with the value first, then that month's
flows (return, income, installment, cost — `MonthPoint` carries them);
keyboard arrows move the crosshair; the year table is the table-view twin.
It measures its container with a `ResizeObserver` so axis text stays 11px
on a phone instead of scaling down with a viewBox.

**It is annotated with the moments that decide the answer** (2026-09-21):
the line starts at the capital and drops by the down payment at month 0
(`Start 5M · down payment −824K`); a marker + label on the tightest month
(`Lowest 501K · month 48`), or on the first breach for a failing price
(`Runs out · month 71`, in `loss`); the end (`Ends 1.5M`), which becomes
`Ends 1.5M = keep target` when it lands on the target — the keep target is a
short TICK at the end, not a second line, because it only applies there; one
label on the first installment cliff and one on each extra cost. Labels use
`formatCompact(v, 3)` (three significant figures) and text tokens, never the
series colour; only markers carry `accent`/`loss`.

**Placement is `app/lib/chartLabels.ts::placeLabels`, pure and tested:**
each label has a priority and a list of spots to try; greedy by priority, a
spot must sit inside the plot and clear every placed label AND every
obstacle — the line itself (sampled every 6px so a cliff is solid) and the
markers. A cliff label's last resorts are rows in the wash under the whole
stretch of line it covers, drawn with a hairline leader back to its point;
a leader that would cross another label drops the label instead. A label
with nowhere to go is dropped — the tooltip and the year table still carry
it — so a phone shows the few that fit rather than a pile-up. Widths are
estimated (`textWidth`, 0.6em per character) because SVG text cannot be
measured before it is laid out.

**The year table is a story, not a grid** (reshaped 2026-09-21). On a phone
each year is one card read top to bottom: Opening → **Paid this year** (down
payment, installments, extra costs; zero rows hidden) → **Covered by** (fund
returns, income, and *From savings* for the rest — or *Left in savings* when
returns + income covered more than was paid) → Closing → Lowest. `paid` and
`fromSavings` (= opening − closing) are derived in `YearTable` from the row;
the engine's reconciliation test is what keeps them honest. To make the
down payment visible, **it is a year-1 flow**: `YearSummary.downPayment` is
the plan's down payment on year 1 and 0 after, year 1's `opening` is the
starting capital (before the payment), and year 1's `lowest` includes the
month-0 balance, so a down payment that alone breaches the buffer flags
the year. On a desktop the table lays the same ledger across one row, with
a Down payment column and no savings column (opening and closing are side
by side already). **Colour follows the money rule:** returns and income are
`gain` (money in), the down payment, installments and costs are `loss`
(money out); balances and the savings row are positions and stay neutral;
a year whose lowest balance breaches the buffer is tinted `loss` — a real
bad outcome.

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

First request creates the schema.

**Pushing: `gh auth switch --user MarkBotros0` first** — the machine has
several `gh` accounts and the wrong one gets a 403 on `MarkBotros0/my-wallet`.

## Deliberately missing (so far)

- Password recovery, account deletion, any admin role — with no admin, a
  forgotten password is a row edit (see the 2026-09-20 open-registration
  spec). A *known* password changes from `/account`; signing other devices
  out when it does is not built (see *Auth*).
- Money accounts (bank / cash — distinct from clients), recurring entries,
  budgets, multi-currency, a per-user God's share rate, expenses linked to
  a client, a Reports page — **not designed yet.** Plan before building.
- Categories and per-entry notes — **removed 2026-09-21**, not merely
  missing: every income is salary, so they carried nothing. Do not bring
  them back for one use case; a client is the "who", the kind is the "what".
- The calculator models no borrowing, no property appreciation, no rent, and
  a constant return rate; the page says so. A price target with a direction
  attached is the thing EGX deliberately refuses to show, and this app should
  keep the same discipline if it ever grows a "projection".
