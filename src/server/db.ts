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
  // `role` is NOT settable through the admin API: it is stamped from the
  // AUTH_ADMINS env var at boot (see server/auth.ts seedUsersFromEnv), which
  // makes privilege escalation through /api/users structurally impossible and
  // keeps admin status declared in one auditable place that survives a DB
  // reset.
  //
  // `is_active` FALSE blocks login AND invalidates any token already issued,
  // because getCurrentUser re-reads this row on every request.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`;

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

  // Deferred import: auth.ts imports this module, so the seed is pulled in at
  // call time rather than at load time to avoid a cycle.
  const { seedUsersFromEnv } = await import("./auth");
  await seedUsersFromEnv(sql);
}

/**
 * The ready database. Runs schema init + env seed exactly once per process;
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
