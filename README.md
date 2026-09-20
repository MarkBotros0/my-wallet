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

Open <http://localhost:3000>. The first request creates the schema; follow
**Create an account** on the sign-in page to make yours.

| variable | purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (`sslmode=require`) |
| `AUTH_SECRET` | signs every JWT — rotate it to log everyone out |

Anyone with the URL can create an account; every ledger row is scoped to its
owner. There is no admin, no e-mail and no password recovery — a forgotten
password is a row edit in the database.

## Scripts

```bash
npm run dev     # dev server (Turbopack)
npm run build   # production build + type-check
npm run lint
```

See [CLAUDE.md](./CLAUDE.md) for the architecture, conventions and the
decisions carried over from EGX.
