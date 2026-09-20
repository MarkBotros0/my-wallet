import { getDb } from "@/server/db";
import { getCurrentUser, nowIso } from "@/server/auth";
import { handle, HttpError, json, readJson } from "@/server/http";
import { fetchOwned } from "@/server/transactions";
import { fetchOwnedClient } from "@/server/clients";
import { validateTransactionInput } from "@/lib/ledger";

/**
 *   PUT    /api/transactions/{id}  — replace the editable fields
 *   DELETE /api/transactions/{id}
 *
 * `fetchOwned` 404s unless the row is the caller's, so neither verb can
 * reach another user's entry.
 */

type Params = { params: Promise<{ id: string }> };

export const PUT = handle(async (req: Request, { params }: Params) => {
  const user = await getCurrentUser(req);
  const { id } = await params;
  const result = validateTransactionInput(await readJson(req));
  if (!result.ok) throw new HttpError(400, result.errors.join(" "));
  const { kind, amount, occurred_on, category, note, client_id, gods_share } = result.value;

  const sql = await getDb();
  const existing = await fetchOwned(sql, user.id, id);
  if (client_id) await fetchOwnedClient(sql, user.id, client_id);
  const now = nowIso();
  await sql`
    UPDATE transactions
    SET kind = ${kind}, amount = ${amount}, occurred_on = ${occurred_on},
        category = ${category}, note = ${note},
        client_id = ${client_id}, gods_share = ${gods_share}, updated_at = ${now}
    WHERE id = ${id} AND user_id = ${user.id}
  `;
  return json({
    transaction: { ...existing, kind, amount, occurred_on, category, note, client_id, gods_share, updated_at: now },
  });
});

export const DELETE = handle(async (req: Request, { params }: Params) => {
  const user = await getCurrentUser(req);
  const { id } = await params;
  const sql = await getDb();
  await fetchOwned(sql, user.id, id);
  await sql`DELETE FROM transactions WHERE id = ${id} AND user_id = ${user.id}`;
  return json({ deleted: id });
});
