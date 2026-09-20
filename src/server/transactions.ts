import type { Sql } from "./db";
import { HttpError } from "./http";
import type { CategorySuggestions, GodsShareTotals, Transaction, TransactionKind, YearIncome } from "@/lib/ledger";

/**
 * The one spelling of the ledger's queries. Every function takes the
 * caller's user id and filters on it — there is no way to read or touch
 * another user's rows through here.
 */

interface Row {
  id: string;
  kind: string;
  amount: number;
  occurred_on: string;
  category: string;
  note: string;
  client_id: string | null;
  gods_share: number;
  created_at: string;
  updated_at: string;
}

function toTransaction(row: Row): Transaction {
  return {
    id: row.id,
    kind: row.kind as TransactionKind,
    amount: Number(row.amount),
    occurred_on: row.occurred_on,
    category: row.category,
    note: row.note,
    client_id: row.client_id,
    gods_share: Number(row.gods_share),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** A month's entries, newest day first and newest-created first within a day. */
export async function listForMonth(
  sql: Sql,
  userId: string,
  range: { from: string; to: string },
): Promise<Transaction[]> {
  const rows = await sql<Row[]>`
    SELECT id, kind, amount::float8 AS amount, occurred_on, category, note,
           client_id, gods_share::float8 AS gods_share, created_at, updated_at
    FROM transactions
    WHERE user_id = ${userId} AND occurred_on >= ${range.from} AND occurred_on < ${range.to}
    ORDER BY occurred_on DESC, created_at DESC
  `;
  return rows.map(toTransaction);
}

/** One client's income for a date range (a calendar year, in practice), newest first. */
export async function listForClient(
  sql: Sql,
  userId: string,
  clientId: string,
  range: { from: string; to: string },
): Promise<Transaction[]> {
  const rows = await sql<Row[]>`
    SELECT id, kind, amount::float8 AS amount, occurred_on, category, note,
           client_id, gods_share::float8 AS gods_share, created_at, updated_at
    FROM transactions
    WHERE user_id = ${userId} AND client_id = ${clientId} AND kind = 'income'
      AND occurred_on >= ${range.from} AND occurred_on < ${range.to}
    ORDER BY occurred_on DESC, created_at DESC
  `;
  return rows.map(toTransaction);
}

/** Distinct categories the user has used, per kind, most-used first. */
export async function categorySuggestions(sql: Sql, userId: string): Promise<CategorySuggestions> {
  const rows = await sql<{ kind: string; category: string }[]>`
    SELECT kind, category
    FROM transactions
    WHERE user_id = ${userId} AND category <> ''
    GROUP BY kind, category
    ORDER BY COUNT(*) DESC, MAX(occurred_on) DESC
  `;
  const out: CategorySuggestions = { expense: [], income: [] };
  for (const r of rows) {
    if (r.kind === "expense" || r.kind === "income") out[r.kind].push(r.category);
  }
  return out;
}

/**
 * All income in a date range (a calendar year, in practice), whether or not
 * it is linked to a client. The Clients page heads its per-client cards with
 * this, so income with no client still counts towards the year.
 */
export async function incomeTotals(
  sql: Sql,
  userId: string,
  range: { from: string; to: string },
): Promise<YearIncome> {
  const [row] = await sql<{ income: number; share: number; count: number }[]>`
    SELECT COALESCE(SUM(amount), 0)::float8     AS income,
           COALESCE(SUM(gods_share), 0)::float8 AS share,
           COUNT(*)::int                        AS count
    FROM transactions
    WHERE user_id = ${userId} AND kind = 'income'
      AND occurred_on >= ${range.from} AND occurred_on < ${range.to}
  `;
  return {
    income: Number(row?.income ?? 0),
    share: Number(row?.share ?? 0),
    count: Number(row?.count ?? 0),
  };
}

export async function fetchOwned(sql: Sql, userId: string, id: string): Promise<Transaction> {
  const rows = await sql<Row[]>`
    SELECT id, kind, amount::float8 AS amount, occurred_on, category, note,
           client_id, gods_share::float8 AS gods_share, created_at, updated_at
    FROM transactions
    WHERE id = ${id} AND user_id = ${userId}
  `;
  // Same 404 whether the row belongs to someone else or does not exist —
  // which of the two is not the caller's business.
  if (!rows[0]) throw new HttpError(404, "Transaction not found.");
  return toTransaction(rows[0]);
}

// ---- God's share ----

/**
 * The tracker's three numbers, all time: what income has set aside, what
 * expenses have paid out, and the difference. The SQL twin of
 * lib/ledger/godsShare.ts::godsShareTotals.
 */
export async function godsShareTotals(sql: Sql, userId: string): Promise<GodsShareTotals> {
  const [row] = await sql<{ accrued: number; settled: number }[]>`
    SELECT
      COALESCE(SUM(gods_share) FILTER (WHERE kind = 'income'), 0)::float8  AS accrued,
      COALESCE(SUM(gods_share) FILTER (WHERE kind = 'expense'), 0)::float8 AS settled
    FROM transactions
    WHERE user_id = ${userId}
  `;
  const accrued = Number(row?.accrued ?? 0);
  const settled = Number(row?.settled ?? 0);
  return { accrued, settled, remaining: Math.round((accrued - settled) * 100) / 100 };
}

/** Expenses that paid God's share, newest first. */
export async function listSettlements(sql: Sql, userId: string, limit = 200): Promise<Transaction[]> {
  const rows = await sql<Row[]>`
    SELECT id, kind, amount::float8 AS amount, occurred_on, category, note,
           client_id, gods_share::float8 AS gods_share, created_at, updated_at
    FROM transactions
    WHERE user_id = ${userId} AND kind = 'expense' AND gods_share > 0
    ORDER BY occurred_on DESC, created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(toTransaction);
}
