@AGENTS.md

# My Wallet — Project Guide for Claude

Read this first. It is short on purpose; grow it as features land.

## What This App Is

A personal money app for **Mark**: track expenses and income, and a calculator
for real-estate buying capacity ("what can I actually afford?"). Mobile-first —
the primary surface is a phone. Multi-user, closed (no public page), with the
same auth and user-management model as EGX Analytics (`D:\Projects\egx-api`).

**Status:** scaffold only. Auth, user admin, PWA and navigation are built and
verified; Home / Transactions / Calculator / Reports are `PlaceholderPage`s.
Feature planning is the next step — nothing about the data model is decided.

## Stack

- **Next.js 16** (App Router, Turbopack, `src/proxy.ts` — NOT `middleware.ts`,
  that name is deprecated in 16), **React 19**, TypeScript, **Tailwind v4**
  (CSS-first config in `globals.css`, no `tailwind.config`).
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
  server/                  # server-only — never import from a client component
    db.ts                  # pool singleton, initDb (schema + env seed), getDb()
    token.ts               # JWT sign/verify + PUBLIC_ENDPOINTS (no DB import)
    auth.ts                # hash/verify, getCurrentUser, requireAdmin, seedUsersFromEnv
    users.ts               # /api/users validation + the two guards
    http.ts                # HttpError, handle(), readJson()
  app/
    layout.tsx             # fonts, PWA metadata, Navbar / main / footer / BottomTabBar
    globals.css            # the design system (see below) + nav clearance vars
    page.tsx               # Home            (placeholder)
    transactions/          # Transactions    (placeholder)
    calculator/            # Calculator      (placeholder)
    reports/               # Reports         (placeholder)
    admin/                 # Users — admin only
    login/
    api/auth/{login,me}    # POST login (the only public route), GET me
    api/users[/[id]][/password]
    lib/api.ts             # fetchJSON (attaches token, 401 → sign out) + users calls
    lib/authStore.ts       # localStorage + presence cookie + useSyncExternalStore store
    components/            # AuthProvider, Navbar, BottomTabBar, admin dialogs, skeletons
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
  Today that is `user_settings`; **add every new per-user table to that list
  in the same commit that creates it.**
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
```

First request creates the schema and seeds `AUTH_USERS` / `AUTH_ADMINS`.

**Pushing: `gh auth switch --user MarkBotros0` first** — the machine has
several `gh` accounts and the wrong one gets a 403 on `MarkBotros0/my-wallet`.

## Deliberately missing (so far)

- Any public surface, self-service password change, role editing in the UI —
  all inherited decisions from EGX.
- Transactions, categories, accounts, the calculator's model, currency
  handling — **not designed yet.** Plan before building.
