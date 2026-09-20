import postgres from "postgres";

/**
 * Postgres connection + schema init.
 *
 * One connection pool per server process (module-level singleton), created
 * lazily so importing this file never opens a socket. `DATABASE_URL` is the
 * Neon connection string, `sslmode=require` included — the same shape EGX
 * uses.
 *
 * There is no migration framework. Every statement in `initDb` is idempotent
 * (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), so a new table
 * or column lands on the next cold start of any process. Add to it, never
 * rewrite what is there.
 */

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as {
  __walletSql?: Sql;
  __walletInit?: Promise<void>;
};

export function getSql(): Sql {
  if (!globalForDb.__walletSql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    globalForDb.__walletSql = postgres(url, {
      // Serverless: a handful of connections per instance is plenty, and Neon's
      // pooled endpoint does the real multiplexing.
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      // postgres.js reads sslmode=require off the URL; this is the fallback
      // for a URL that omits it, since Neon refuses plaintext.
      ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : "require",
    });
  }
  return globalForDb.__walletSql;
}

async function initDb(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    )
  `;
  // Databases from before 2026-09-20 also carry `role` and `is_active`
  // columns from the admin model. They have defaults, nothing reads them,
  // and nothing drops them — never rewrite what exists.

  // Per-user preferences (currency, display options — whatever comes). A
  // separate table keyed by user, so deleting a user has one obvious place to
  // clean up.
  await sql`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT NOT NULL,
      key     TEXT NOT NULL,
      value   TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    )
  `;

  // The ledger. NUMERIC so sums are exact in SQL; read back as ::float8.
  // occurred_on is ISO text like every other date here — a month is the
  // half-open string range [YYYY-MM-01, next-01). See src/lib/ledger.
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      kind        TEXT NOT NULL,
      amount      NUMERIC(14,2) NOT NULL,
      occurred_on TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS transactions_user_day ON transactions (user_id, occurred_on)`;
  // Databases from before 2026-09-21 also carry `category` and `note` columns
  // (every income is salary, so they said nothing). Both default to '', so
  // an insert that omits them succeeds; nothing reads them, nothing drops them.

  // Clients: the people income is collected from. A client is per user and
  // its name is unique per user, case-insensitively — "Acme" and "acme" are
  // one client mistyped, not two.
  await sql`
    CREATE TABLE IF NOT EXISTS clients (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      name       TEXT NOT NULL,
      note       TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS clients_user_name ON clients (user_id, lower(name))`;

  // An income entry may be linked to a client (NULL = unlinked; deleting a
  // client nulls this rather than removing the income). `gods_share` means
  // the same thing on both kinds — how much of the entry is God's share
  // money: set aside on an income, paid out on an expense — so the tracker is
  // two SUMs on one column. Rows from before the column carry 0.
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_id TEXT`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gods_share NUMERIC(14,2) NOT NULL DEFAULT 0`;
  await sql`CREATE INDEX IF NOT EXISTS transactions_user_client ON transactions (user_id, client_id, occurred_on)`;
}

/**
 * The ready database. Runs schema init exactly once per process;
 * every route handler awaits this rather than touching `getSql()` directly.
 *
 * A failed init is NOT cached — the next request retries, so a transient
 * connection error on a cold start does not leave the process permanently
 * broken.
 */
export async function getDb(): Promise<Sql> {
  const sql = getSql();
  if (!globalForDb.__walletInit) {
    globalForDb.__walletInit = initDb(sql).catch((e) => {
      globalForDb.__walletInit = undefined;
      throw e;
    });
  }
  await globalForDb.__walletInit;
  return sql;
}

export type { Sql };
