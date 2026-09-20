# Open registration — self-service accounts, no admin

_Approved in chat 2026-09-20. This file is the record; the implementation is the truth._

## Purpose

Anyone with the URL can create their own account and start using the app.
This **reverses** the closed, admin-managed model inherited from EGX (see the
2026-09-16 ledger spec and the original CLAUDE.md): there is no longer an
admin role, no Users page, and no account seeding from the environment.

The decision was taken in two steps in one session: first `AUTH_USERS` was
dropped as "not important", then, rather than keep a bootstrap admin at all,
the user chose open sign-up. The ledger data is user-scoped end to end, so
a stranger creating an account sees only their own empty ledger — the risk of
an open door is junk rows, not leaked data. An invite code was offered and
declined.

## Scope

**In:** a public `POST /api/auth/register`; a `/register` page that is the
login page's twin and signs the new user in on success; removal of the admin
subsystem (role, `AUTH_ADMINS`, `/admin`, `/api/users`, the admin dialogs)
and of `NEXT_PUBLIC_APP_URL`, which only ever fed the "Login details" block
in the password-reveal dialog.

**Out (deliberately):** self-service password change, password recovery,
account deletion, e-mail. With no admin and no reset, a forgotten password
means the account is unrecoverable short of editing the database. Recorded
under *Deliberately missing* in CLAUDE.md.

**Untouched:** the JWT model, `getCurrentUser` re-reading the row on every
request (a row deleted by hand still ends that user's session at once), the
`/api/*` default-deny gate, the page redirect gate.

## Data

`users(id, username UNIQUE, password_hash, created_at)` — the table as
originally created. `initDb` **stops adding** the `role` and `is_active`
columns and no query references them. Existing databases keep the two
orphan columns; they carry defaults, so inserts still work, and nothing is
dropped ("never rewrite what exists").

`user_settings` and `transactions` keep their `user_id` columns; nothing
deletes a user any more, so the cascade rule in CLAUDE.md becomes moot and
is removed from the docs.

## API

| route | gate | does |
|---|---|---|
| `POST /api/auth/register` | **public** | body `{username, password}` → 201 `{access_token, token_type, user}` — the same shape login returns, so the client is signed in at once |
| `POST /api/auth/login` | public | unchanged |
| `GET /api/auth/me` | token | unchanged minus `role` |
| `/api/users/*` | — | **removed** (404) |

`PUBLIC_ENDPOINTS` grows from one entry to two. Everything else stays
default-deny.

Validation lives in `server/auth.ts` (moved from the deleted `server/users.ts`)
and is the rule the admin form used: username trimmed, lower-cased,
`^[a-z0-9._-]{3,32}$`; password ≥ 8 characters and **not** trimmed — login
does not trim either, so what was typed at sign-up is exactly what signs in
(the old admin path trimmed, a latent mismatch that goes away). A taken username is
detected from the `UNIQUE` violation (`23505`), not a pre-select, so two
racing sign-ups cannot both succeed; it answers `409 "That username is
taken."`. Other failures are `400 {detail}` like every route.

## UI

- `/register` — its own route with a `loading.tsx`, listed in the proxy's
  `PUBLIC_PATHS` beside `/login` (a signed-in visitor is bounced to `/`, same
  as on `/login`). Same card, `autoComplete="new-password"`, button "Create
  account", link "Already have an account? Sign in".
- `/login` — gains the link "New here? Create an account". Both links carry
  `?next=` through.
- One `AuthCard` shell (logo, title, subtitle) shared by both pages so the
  header is written once; each page keeps its own form.
- `Navbar` loses the Users icon; `AuthProvider` loses `isAdmin`; the client
  user shape is `{id, username}`.

Why a separate route rather than a mode toggle on the login card: a distinct
URL lets browser password managers key the saved credential correctly, and
`?next=` handling stays exactly as it is.

## Environment

`DATABASE_URL` and `AUTH_SECRET`. Nothing else. `AUTH_USERS`, `AUTH_ADMINS`
and `NEXT_PUBLIC_APP_URL` are gone from `.env.example`, README and CLAUDE.md;
a stale copy in a local `.env` or on Vercel is simply ignored.

## Removed

`src/app/admin/`, `src/app/api/users/`, `src/server/users.ts`,
`AdminUsersTable`, `CreateUserModal`, `PasswordRevealDialog`; in
`server/auth.ts`: `generatePassword`, `requireAdmin`, `isAdmin`, the role
constants, `applyAdminsFromEnv`; in `lib/api.ts`: the user-administration
calls; in `authStore` / `AuthProvider`: `UserRole`, `asRole`, `isAdmin`.

## Testing

- Vitest: the two validators (`cleanUsername`, `cleanPassword`) get cases for
  the accept/reject edges — they moved, so they get pinned.
- `npm run build` (type-check) and `npm run lint` clean.
- In the preview: sign up → landed signed in → log out → sign in with the new
  credentials; a second sign-up with the same username shows the 409 detail;
  `/admin` and `/api/users` answer 404; `/register` while signed in redirects
  to `/`.
