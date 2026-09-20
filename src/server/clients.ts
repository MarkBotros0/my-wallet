import type { Sql } from "./db";
import { HttpError } from "./http";
import type { Client, ClientOption, ClientSummary } from "@/lib/ledger";

/**
 * The one spelling of the clients queries. Every function takes the caller's
 * user id and filters on it, the same way server/transactions.ts does.
 */

interface Row {
  id: string;
  name: string;
  note: string;
  created_at: string;
  updated_at: string;
}

interface SummaryRow extends Row {
  year_total: number;
  year_share: number;
  year_count: number;
}

function toClient(row: Row): Client {
  return { id: row.id, name: row.name, note: row.note, created_at: row.created_at, updated_at: row.updated_at };
}

/**
 * Every client with what it paid in one date range (a calendar year). LEFT
 * JOIN, so a client with nothing this year still lists at zero — it exists,
 * it just has not paid yet. Biggest payer first, then by name.
 */
export async function listClientsForYear(
  sql: Sql,
  userId: string,
  range: { from: string; to: string },
): Promise<ClientSummary[]> {
  const rows = await sql<SummaryRow[]>`
    SELECT c.id, c.name, c.note, c.created_at, c.updated_at,
           COALESCE(SUM(t.amount), 0)::float8     AS year_total,
           COALESCE(SUM(t.gods_share), 0)::float8 AS year_share,
           COUNT(t.id)::int                       AS year_count
    FROM clients c
    LEFT JOIN transactions t
      ON t.client_id = c.id AND t.user_id = c.user_id AND t.kind = 'income'
     AND t.occurred_on >= ${range.from} AND t.occurred_on < ${range.to}
    WHERE c.user_id = ${userId}
    GROUP BY c.id, c.name, c.note, c.created_at, c.updated_at
    ORDER BY year_total DESC, lower(c.name) ASC
  `;
  return rows.map((r) => ({
    ...toClient(r),
    year_total: Number(r.year_total),
    year_share: Number(r.year_share),
    year_count: Number(r.year_count),
  }));
}

/** Names for the form's select, alphabetical. */
export async function clientOptions(sql: Sql, userId: string): Promise<ClientOption[]> {
  return sql<ClientOption[]>`
    SELECT id, name FROM clients WHERE user_id = ${userId} ORDER BY lower(name) ASC
  `;
}

export async function fetchOwnedClient(sql: Sql, userId: string, id: string): Promise<Client> {
  const rows = await sql<Row[]>`
    SELECT id, name, note, created_at, updated_at
    FROM clients
    WHERE id = ${id} AND user_id = ${userId}
  `;
  // Same 404 whether the row belongs to someone else or does not exist —
  // which of the two is not the caller's business.
  if (!rows[0]) throw new HttpError(404, "Client not found.");
  return toClient(rows[0]);
}

/**
 * The unique index on (user_id, lower(name)) is the real guard; this turns
 * its violation into a message the form can show. `excludeId` lets a rename
 * keep its own name.
 */
export async function guardUniqueName(sql: Sql, userId: string, name: string, excludeId?: string): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM clients WHERE user_id = ${userId} AND lower(name) = lower(${name})
  `;
  if (rows.some((r) => r.id !== excludeId)) {
    throw new HttpError(409, `You already have a client called "${name}".`);
  }
}
