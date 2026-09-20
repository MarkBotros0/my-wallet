import { getDb } from "@/server/db";
import { getCurrentUser, newId, nowIso } from "@/server/auth";
import { handle, HttpError, json, readJson } from "@/server/http";
import { listForMonth } from "@/server/transactions";
import { clientOptions, fetchOwnedClient } from "@/server/clients";
import { isMonthKey, monthRange, validateTransactionInput } from "@/lib/ledger";

/**
 *   GET  /api/transactions?month=YYYY-MM  — the month's entries + the clients for the form
 *   POST /api/transactions                — create one
 *
 * Both scoped to the caller. Validation is src/lib/ledger/validate.ts, the
 * same code the form runs, so the two cannot disagree about what is allowed.
 */

export const GET = handle(async (req: Request) => {
  const user = await getCurrentUser(req);
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!isMonthKey(month)) {
    throw new HttpError(400, "month must be YYYY-MM.");
  }
  const sql = await getDb();
  const [transactions, clients] = await Promise.all([
    listForMonth(sql, user.id, monthRange(month)),
    clientOptions(sql, user.id),
  ]);
  return json({ month, transactions, clients });
});

export const POST = handle(async (req: Request) => {
  const user = await getCurrentUser(req);
  const result = validateTransactionInput(await readJson(req));
  if (!result.ok) throw new HttpError(400, result.errors.join(" "));
  const { kind, amount, occurred_on, client_id, gods_share } = result.value;

  const sql = await getDb();
  // A client id is only ever the caller's own — another user's 404s here,
  // before anything is written.
  if (client_id) await fetchOwnedClient(sql, user.id, client_id);
  const id = newId();
  const now = nowIso();
  await sql`
    INSERT INTO transactions (id, user_id, kind, amount, occurred_on, client_id, gods_share, created_at, updated_at)
    VALUES (${id}, ${user.id}, ${kind}, ${amount}, ${occurred_on}, ${client_id}, ${gods_share}, ${now}, ${now})
  `;
  return json(
    {
      transaction: {
        id, kind, amount, occurred_on, client_id, gods_share,
        created_at: now, updated_at: now,
      },
    },
    201,
  );
});
