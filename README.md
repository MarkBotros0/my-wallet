# My Wallet

A personal money app: track expenses and income, and work out real-estate
buying capacity. Mobile-first PWA, multi-user, closed (sign-in required).

Built with **Next.js 16** (App Router), React 19, TypeScript, Tailwind v4 and
Postgres (Neon). Shares its design system and user-management model with
[EGX Analytics](https://github.com/MarkBotros0/egx-api-fe).

## Getting started

```bash
cp .env.example .env   # then fill in DATABASE_URL and AUTH_SECRET
npm install
npm run dev
```

Open <http://localhost:3000>. The first request creates the schema and seeds
the accounts listed in `AUTH_USERS`, promoting those in `AUTH_ADMINS`.

| variable | purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (`sslmode=require`) |
| `AUTH_SECRET` | signs every JWT — rotate it to log everyone out |
| `AUTH_USERS` | bootstrap accounts, `user:password,user:password`; created only if missing |
| `AUTH_ADMINS` | comma-separated admin usernames; authoritative, re-applied on boot |
| `NEXT_PUBLIC_APP_URL` | address pasted into the "Login details" block (defaults to the current origin) |

There is no sign-up. Admins create users from the **Users** page (icon beside
Log out) and hand over a generated password, shown once.

## Scripts

```bash
npm run dev     # dev server (Turbopack)
npm run build   # production build + type-check
npm run lint
```

See [CLAUDE.md](./CLAUDE.md) for the architecture, conventions and the
decisions carried over from EGX.
